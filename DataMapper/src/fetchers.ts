import { Db, Document, ObjectId } from 'mongodb';
import * as StellarSDK from '@stellar/stellar-sdk';
import { sleep } from './utils.js';
import { config } from './env_config.js';

const API_KEY = `${config.api_key}`;
console.log(API_KEY)
const BASE_URL = 'https://api.stellar.expert';

const MAX_FILTERS = 10;
const SLEEP_DURATION_MS = 25;

export interface Badge {
  _id?: ObjectId;
  index: number;
  assetCode: string;
  assetIssuer: string;
  owner: string;
  balance: string;
  transactions: { badgeId: ObjectId; tx: string }[];
}

export interface Asset {
  code: string;
  issuer: string;
}

// Interface for the BadgeHolders collection
export interface BadgeHolder extends Document {
  _id?: ObjectId;
  owner: string;
  badges: { badgeId: ObjectId; tx: string }[];
}


// Interface for the Transaction collection
export interface Transaction {
  _id?: ObjectId;
  account_id: string;
  badge_ids: ObjectId[];
  tx_hash: string;
  ledger: number;
  timestamp: number;
  body: string;
  meta: string;
  result: string;
}


export async function fetchTransactionsForHolder(db: Db, address: string) {
  const assetFilters = new Set<string>();
  const accountFilters = [`account[]=${address}`];

  // Fetch all badges from the database
  const badges = await db.collection('badges').find().toArray() as Badge[];
  badges.forEach(badge => {
    assetFilters.add(`asset[]=${badge.assetCode}-${badge.assetIssuer}-2`);
  });
  console.log(assetFilters)
  const urlBatches = createUrlBatches(Array.from(assetFilters.values()), accountFilters);

  const allTransactions: any[] = [];

  for (const urlBatch of urlBatches) {
    const data = await fetchTransactionsForUrlBatch(db, urlBatch);
    if (data) {
      allTransactions.push(...data);
    }
    await sleep(SLEEP_DURATION_MS);
  }

  return allTransactions;
}

async function fetchWithRetry(url: string): Promise<any> {
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.warn('Too Many Requests - sleeping for 60 seconds');
        await sleep(60000);
        return fetchWithRetry(url); // Retry after sleeping
      }
      throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    await sleep(SLEEP_DURATION_MS);
    return response.json();
  } catch (error) {
    throw new Error(`Failed to fetch ${url}: ${(error as Error).message}`);
  }
}

export async function fetchAssetHolders(db: Db, asset: Asset): Promise<Badge[]> {
  let allHolders: Badge[] = [];
  const assetData = await db.collection('badges').findOne({ code: asset.code, issuer: asset.issuer });

  let nextUrl: string | null = assetData?.lastMarkUrlHolders ? `${BASE_URL}${assetData.lastMarkUrlHolders}` : `${BASE_URL}/explorer/public/asset/${asset.code}-${asset.issuer}/holders?order=desc&limit=200`;
  let badgeIndex = 1;

  while (nextUrl) {
    try {
      console.log(`Fetching holders for ${asset.code}-${asset.issuer} from ${nextUrl}`);
      const data: any = await fetchWithRetry(nextUrl);

      const holders = data._embedded.records.map((record: any) => ({
        _id: new ObjectId(), // Replace this with a real ObjectId if needed
        index: badgeIndex++, // Auto-increment index
        assetCode: asset.code,
        assetIssuer: asset.issuer,
        owner: record.account,
        balance: record.balance,
        transactions: [{ badgeId: assetData?._id, tx: '' }], // Placeholder for transaction
      }));

      allHolders = allHolders.concat(holders);

      if (data._embedded.records.length < 200) {
        nextUrl = null;
      } else {
        nextUrl = BASE_URL + data._links.next.href;
      }

      await db.collection('badges').updateOne(
        { code: asset.code, issuer: asset.issuer },
        { $set: { lastMarkUrlHolders: data._links.self.href } }
      );

      await sleep(SLEEP_DURATION_MS);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Not Found')) {
        console.warn(`No holders found for asset ${asset.code}-${asset.issuer}`);
        break;
      } else {
        throw err; // Re-throw unexpected errors
      }
    }
  }

  return allHolders;
}

export async function fetchAllAssetHolders(db: Db, assets: Asset[], fetchFromApi: boolean): Promise<Badge[]> {
  if (!fetchFromApi) {
    // Fetch holders from database where badges match the provided assets
    const assetCodes = assets.map(asset => asset.code);
    const assetIssuers = assets.map(asset => asset.issuer);

    const matchingBadges = await db.collection('badges').find({
      code: { $in: assetCodes },
      issuer: { $in: assetIssuers }
    }).toArray();

    const badgeIds = matchingBadges.map(badge => badge._id);

    const badgeHolders: BadgeHolder[] = await db.collection('BadgeHolders').find({
      'badges.badgeId': { $in: badgeIds }
    }).toArray() as BadgeHolder[];

    const allHolders: Badge[] = [];
    for (const holder of badgeHolders) {
      for (const badge of holder.badges) {
        const asset = matchingBadges.find(matchingBadge => matchingBadge._id.equals(badge.badgeId));
        if (asset) {
          allHolders.push({
            _id: badge.badgeId,
            index: asset.index,
            assetCode: asset.code,
            assetIssuer: asset.issuer,
            owner: holder.owner,
            balance: asset.balance,
            transactions: [{ badgeId: badge.badgeId, tx: badge.tx }]
          });
        }
      }
    }
    return allHolders;
  }

  const allHolders: Badge[] = [];
  for (const asset of assets) {
    const holders = await fetchAssetHolders(db, asset);

    for (const holder of holders) {
      const existingHolder = await db.collection('BadgeHolders').findOne({ owner: holder.owner });

      if (!existingHolder) {
        await db.collection('BadgeHolders').insertOne({
          owner: holder.owner,
          badges: [{ badgeId: holder.transactions[0].badgeId, tx: '' }],
        });
      } else {
        const existingTransactions = existingHolder.badges;
        let transactionUpdated = false;
        for (const entry of existingTransactions) {
          if (entry.badgeId.equals(holder.transactions[0].badgeId)) {
            if (entry.tx === '') {
              entry.tx = ''; // This will be updated later when processing transactions
            }
            transactionUpdated = true;
          }
        }
        if (!transactionUpdated) {
          existingTransactions.push({ badgeId: holder.transactions[0].badgeId, tx: '' });
        }

        await db.collection('BadgeHolders').updateOne(
          { owner: holder.owner },
          { $set: { badges: existingTransactions } }
        );
      }

      allHolders.push(holder);
    }
  }

  return allHolders;
}



/**
 * Fetch transactions for given badges and holder accounts.
 * @param {Db} db - Database connection.
 * @param {Badge[]} holders - List of holders to fetch transactions for.
 */
export async function fetchTransactions(db: Db, holders: Badge[]) {
  const assetMap = new Map<string, Set<string>>();

  // Group holders by asset
  holders.forEach(holder => {
    const assetKey = `${holder.assetCode}-${holder.assetIssuer}`;
    if (!assetMap.has(assetKey)) {
      assetMap.set(assetKey, new Set());
    }
    assetMap.get(assetKey)?.add(holder.owner);
  });

  const allUrlBatches: string[] = [];

  // Process assets in chunks of 2
  const assetEntries = Array.from(assetMap.entries());
  for (let i = 0; i < assetEntries.length; i += 10) {
    const chunk = assetEntries.slice(i, i + 10);
    const assetFilters: string[] = [];
    const accountFilters: string[] = [];

    chunk.forEach(([asset, owners]) => {
      assetFilters.push(`asset[]=${asset}-2`);
      //owners.forEach(owner => {
        accountFilters.push(`account[]=${asset.split('-')[1]}`);
      //});
    });

    const urlBatches = createUrlBatches(assetFilters, accountFilters);
    allUrlBatches.push(...urlBatches);
  }

  // Run URL batches asynchronously with rate limiting
  for (let i = 0; i < allUrlBatches.length; i += 10) {
    const batch = allUrlBatches.slice(i, i + 10);
    await Promise.all(batch.map(url => fetchTransactionsForUrlBatch(db, url)));
    await sleep(1000); // Ensure no more than 10 requests per second
  }
}

/**
 * Create URL batches for asset and account filters.
 * @param {Badge[]} holders - List of holders to fetch transactions for.
 * @param {Map<string, any[]>} badgeMap - Map of badge codes to badges.
 * @returns {string[]} - List of batched URLs.
 */
export function createUrlBatches(assetFilters: string[], accountFilters: string[]): string[] {
  console.log('Entering createUrlBatches');
  const batches: string[] = [];
  const baseUrl = 'https://api.stellar.expert/explorer/public/tx?order=desc&limit=200&type[]=15&type[]=1';

  for (let assetIndex = 0; assetIndex < assetFilters.length; assetIndex += MAX_FILTERS) {
    const assetBatch = assetFilters.slice(assetIndex, assetIndex + MAX_FILTERS).join('&');
    for (let accountIndex = 0; accountIndex < accountFilters.length; accountIndex += MAX_FILTERS) {
      const accountBatch = accountFilters.slice(accountIndex, accountIndex + MAX_FILTERS).join('&');
      const url = `${baseUrl}&${assetBatch}&${accountBatch}`;
      batches.push(url);
    }
  }

  console.log(`Created ${batches.length} URL batches`);
  return batches;
}

/**
 * Fetch transactions for a batch of URLs.
 * @param {Db} db - Database connection.
 * @param {string} url - URL batch to fetch.
 * @returns {Promise<any[]>} - List of transaction records.
 */
export async function fetchTransactionsForUrlBatch(db: Db, url: string): Promise<any[]> {
  let nextUrl: string | null = url;
  const transactions: any[] = [];

  do {
    console.log(`Fetching from URL: ${nextUrl.slice(-72)}`); // .slice(-20)
    const data: any = await fetchWithRetry(nextUrl);
    console.log(data._embedded.records.length)
    transactions.push(...data._embedded.records);
    await processTransactionRecords(db, data._embedded.records);

    // Check if we need to paginate
    if (data._embedded.records.length < 200) {
      nextUrl = null;
    } else {
      nextUrl = BASE_URL + data._links.next.href;
    }

  } while (nextUrl);

  return transactions;
}

/**
 * Process transaction records and update database.
 * @param {Db} db - Database connection.
 * @param {any[]} records - List of transaction records to process.
 */
async function processTransactionRecords(db: Db, records: any[]) {
  for (const record of records) {
    try {
      const envelope = StellarSDK.xdr.TransactionEnvelope.fromXDR(record.body, 'base64');
      let transaction;

      if (envelope.switch().value === StellarSDK.xdr.EnvelopeType.envelopeTypeTx().value) {
        transaction = new StellarSDK.Transaction(envelope, StellarSDK.Networks.PUBLIC);
      } else if (envelope.switch().value === StellarSDK.xdr.EnvelopeType.envelopeTypeTxFeeBump().value) {
        transaction = new StellarSDK.FeeBumpTransaction(envelope, StellarSDK.Networks.PUBLIC).innerTransaction;
      } else {
        console.warn(`Unsupported envelope type: ${envelope.switch()}`);
        continue;
      }

      const paymentOps = transaction.operations.filter(op => 
        op.type === 'payment'
      ) as StellarSDK.Operation.Payment[];

      const txDetails: Transaction = {
        account_id: '',
        badge_ids: [],
        tx_hash: record.hash,
        ledger: record.ledger,
        timestamp: record.ts,
        body: JSON.stringify(transaction),
        meta: record.meta,
        result: record.result,
      };

      let isPaymentProcessed = false;

      for (const op of paymentOps) {
        const badge = await db.collection('badges').findOne({ code: op.asset.code, issuer: op.asset.issuer });

        if (badge) {
          txDetails.account_id = op.destination;

          // Avoid duplicates in badge_ids
          if (!txDetails.badge_ids.some(badgeId => badgeId.equals(badge._id))) {
            txDetails.badge_ids.push(badge._id);
          }

          const badgeHolder = await db.collection('BadgeHolders').findOne({ owner: op.destination });
          if (badgeHolder) {
            const transactions = badgeHolder.badges;
            updateTransactionHash(transactions, badge._id, record.hash);

            await db.collection('BadgeHolders').updateOne(
              { owner: op.destination },
              { $set: { badges: transactions } }
            );

            await saveTransactionData(db, txDetails);

            isPaymentProcessed = true;
          }
        }
      }

      if (!isPaymentProcessed) {
        const txMeta = StellarSDK.xdr.TransactionMeta.fromXDR(record.meta, 'base64');
        const claimedBalances = processTransactionMeta(txMeta);

        for (const claimed of claimedBalances) {
          const badge = await db.collection('badges').findOne({ code: claimed.assetCode, issuer: claimed.assetIssuer });

          if (badge) {
            txDetails.account_id = claimed.account;

            // Avoid duplicates in badge_ids
            if (!txDetails.badge_ids.some(badgeId => badgeId.equals(badge._id))) {
              txDetails.badge_ids.push(badge._id);
            }

            const badgeHolder = await db.collection('BadgeHolders').findOne({ owner: claimed.account });
            if (badgeHolder) {
              const transactions = badgeHolder.badges;
              updateTransactionHash(transactions, badge._id, record.hash);

              await db.collection('BadgeHolders').updateOne(
                { owner: claimed.account },
                { $set: { badges: transactions } }
              );

              await saveTransactionData(db, txDetails);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing record:', error, 'Record:', JSON.stringify(record, null, 2));
    }
  }
}

/**
 * Update transaction hash for a badge.
 * @param {object[]} transactions - List of transactions.
 * @param {ObjectId} badgeId - Badge ID.
 * @param {string} hash - Transaction hash.
 */
function updateTransactionHash(transactions: { badgeId: ObjectId; tx: string }[], badgeId: ObjectId, hash: string) {
  const transactionEntry = transactions.find((t) => t.badgeId.equals(badgeId));
  if (transactionEntry) {
    if (transactionEntry.tx === '') {
      transactionEntry.tx = hash;
    } else if (transactionEntry.tx !== hash) {
      console.warn(`Transaction hash conflict for badge ID: ${badgeId} TxHash: ${hash} conflictedHash: ${transactionEntry.tx}`);
    }
  }
}

/**
 * Process transaction meta and identify claimed balances.
 * @param {any} txMeta - Transaction meta data.
 * @returns {object[]} - List of claimed balances.
 */
// Ensure correct processing of claimable balances
function processTransactionMeta(txMeta: any): { account: string; balance: string; assetCode: string; assetIssuer: string }[] {
  const changes: any[] = [];

  // Extract changes from txChangesBefore
  if (Array.isArray(txMeta.value().txChangesBefore())) {
    txMeta.value().txChangesBefore().forEach((change: any) => {
      changes.push(change);
    });
  }

  // Extract changes from operations
  if (Array.isArray(txMeta.value().operations())) {
    txMeta.value().operations().forEach((operationMeta: any) => {
      if (Array.isArray(operationMeta.changes())) {
        operationMeta.changes().forEach((change: any) => {
          changes.push(change);
        });
      }
    });
  }

  // Extract changes from txChangesAfter
  if (Array.isArray(txMeta.value().txChangesAfter())) {
    txMeta.value().txChangesAfter().forEach((change: any) => {
      changes.push(change);
    });
  }

  const trackedBalances: any = {};

  changes.forEach(change => {
    const createdBalance = processClaimableBalanceCreation(change);
    if (createdBalance) {
      trackedBalances[createdBalance.balanceId] = createdBalance;
    }
  });

  const claimedBalances: any[] = [];
  changes.forEach(change => {
    const claimedBalance = isClaimableBalanceClaimed(change, trackedBalances);
    if (claimedBalance) {
      claimedBalances.push(claimedBalance);
    }
  });

  return claimedBalances;
}


/**
 * Process claimable balance creation change.
 * @param {any} change - Change data.
 * @returns {object|null} - Balance details if a balance is created, otherwise null.
 */
function processClaimableBalanceCreation(change: any): { balanceId: string; asset: any; amount: string; claimants: any[] } | null {
  if (
      change._switch.name === 'ledgerEntryState' &&
      change._arm === 'state' &&
      change._value &&
      change._value._attributes &&
      change._value._attributes.data &&
      change._value._attributes.data._switch.name === 'claimableBalance' &&
      change._value._attributes.data._arm === 'claimableBalance'
    ) {
    const balance = change._value._attributes.data._value._attributes;
    const assetDetails = balance.asset._value._attributes;

    const assetCode = bufferToString(assetDetails.assetCode);
    const assetIssuer = StellarSDK.StrKey.encodeEd25519PublicKey(assetDetails.issuer._value);
    const asset = new StellarSDK.Asset(assetCode, assetIssuer);

    const balanceIdBuffer = balance.balanceId._value;
    const balanceId = Buffer.from(balanceIdBuffer).toString('hex');

    return { balanceId, asset, amount: balance.amount._value, claimants: balance.claimants };
  }

  return null;
}

/**
 * Check if a claimable balance is claimed.
 * @param {any} change - Change data.
 * @param {any[]} trackedBalances - List of tracked balances.
 * @returns {object|null} - Claimed balance details if a balance is claimed, otherwise null.
 */
function isClaimableBalanceClaimed(change: any, trackedBalances: any): { account: string; balance: string; assetCode: string; assetIssuer: string } | null {
  if (
    change._switch.name === 'ledgerEntryRemoved' &&
    change._arm === 'removed' &&
    change._value &&
    change._value._switch.name === 'claimableBalance' &&
    change._value._arm === 'claimableBalance'
  ) {
    const balanceIdBuffer = change._value._value._attributes.balanceId._value;
    const balanceId = Buffer.from(balanceIdBuffer).toString('hex');

    const trackedBalance = trackedBalances[balanceId];
    if (trackedBalance && trackedBalance.claimants) {
      const claimant = trackedBalance.claimants.find((c: any) => {
        return (
          c._value &&
          c._value._attributes &&
          c._value._attributes.destination &&
          trackedBalance.claimants.some(
            (tc: any) => Buffer.compare(tc._value._attributes.destination._value, c._value._attributes.destination._value) === 0
          )
        );
      });

      if (claimant) {
        return {
          account: StellarSDK.StrKey.encodeEd25519PublicKey(claimant._value._attributes.destination._value),
          balance: trackedBalance.amount,
          assetCode: trackedBalance.asset.code,
          assetIssuer: trackedBalance.asset.issuer,
        };
      }
    }
  }

  return null;
}


/**
 * Convert buffer to string.
 * @param {Uint8Array} buffer - Buffer to convert.
 * @returns {string} - Converted string.
 */
function bufferToString(buffer: Uint8Array): string {
  return String.fromCharCode(...buffer).replace(/\0/g, '');
}

// Ensure saveTransactionData function is defined
async function saveTransactionData(db: Db, tx: any) {
  await db.collection('transactions').updateOne(
    { tx_hash: tx.tx_hash },
    {
      $set: {
        account_id: tx.account_id,
        ledger: tx.ledger,
        timestamp: tx.timestamp,
        body: tx.body,
        meta: tx.meta,
        result: tx.result,
      },
      $addToSet: { badge_ids: { $each: tx.badge_ids } }
    },
    { upsert: true }
  );
}

