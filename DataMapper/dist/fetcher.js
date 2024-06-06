import * as StellarSDK from '@stellar/stellar-sdk';
import { openDb } from './database.js';
import { sleep } from './utils.js';
const API_KEY = `Bearer ${process.env.API_KEY || ''}`;
const BASE_URL = 'https://api.stellar.expert';
const MAX_FILTERS = 10;
const SLEEP_DURATION_MS = 200;
/**
 * Fetch data from a URL with retry on failure.
 * @param {string} url - The URL to fetch data from.
 * @returns {Promise<any>} - The JSON response from the fetch.
 * @throws Will throw an error if the fetch fails.
 */
async function fetchWithRetry(url) {
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${API_KEY}`
        }
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    }
    await sleep(1000);
    return response.json();
}
/**
 * Fetch asset holders for a given asset with pagination.
 * @param {Asset} asset - The asset to fetch holders for.
 * @returns {Promise<Badge[]>} - A list of badges for asset holders.
 */
export async function fetchAssetHolders(asset) {
    let allHolders = [];
    let nextUrl = `${BASE_URL}/explorer/public/asset/${asset.code}-${asset.issuer}/holders?order=desc&limit=200`;
    let badgeIndex = 1;
    while (nextUrl) {
        try {
            console.log(`Fetching holders for ${asset.code}-${asset.issuer} from ${nextUrl}`);
            const data = await fetchWithRetry(nextUrl);
            const holders = data._embedded.records.map((record) => ({
                index: badgeIndex++, // Auto-increment index
                assetCode: asset.code,
                assetIssuer: asset.issuer,
                owner: record.account,
                balance: record.balance,
                transactions: [{ assetCode: asset.code, assetIssuer: asset.issuer, transaction: '' }], // Placeholder for transaction
            }));
            allHolders = allHolders.concat(holders);
            // Check if we need to paginate
            if (data._embedded.records.length < 200) {
                break;
            }
            console.log('PAGINATING NOW...');
            nextUrl = data._links.next ? BASE_URL + data._links.next.href : null;
            await sleep(SLEEP_DURATION_MS);
        }
        catch (err) {
            if (err instanceof Error && err.message.includes('Not Found')) {
                console.warn(`No holders found for asset ${asset.code}-${asset.issuer}`);
                break;
            }
            else {
                throw err; // Re-throw unexpected errors
            }
        }
    }
    return allHolders;
}
/**
 * Fetch holders for all assets.
 * @param {Asset[]} assets - List of assets to fetch holders for.
 * @returns {Promise<Badge[]>} - A list of all badges for asset holders.
 */
export async function fetchAllAssetHolders(assets) {
    const db = await openDb();
    const allHolders = [];
    for (const asset of assets) {
        console.log(`Fetching asset holders for asset: ${asset.code}-${asset.issuer}`);
        const holders = await fetchAssetHolders(asset);
        console.log(holders);
        for (const holder of holders) {
            const existingHolder = await db.get('SELECT * FROM BadgeHolders WHERE owner = ?', [holder.owner]);
            if (!existingHolder) {
                await db.run('INSERT INTO BadgeHolders (owner, transactions, lastMarkUrl) VALUES (?, ?, ?)', [
                    holder.owner,
                    JSON.stringify([{ assetCode: holder.assetCode, assetIssuer: holder.assetIssuer, transaction: '' }]),
                    null // Initial sync, no last mark URL
                ]);
            }
            else {
                // Existing holder, check and update transactions array
                const existingTransactions = JSON.parse(existingHolder.transactions);
                let transactionUpdated = false;
                for (const entry of existingTransactions) {
                    if (entry.assetCode === holder.assetCode && entry.assetIssuer === holder.assetIssuer) {
                        if (entry.transaction === '') {
                            entry.transaction = ''; // This will be updated later when processing transactions
                        }
                        transactionUpdated = true;
                    }
                }
                if (!transactionUpdated) {
                    existingTransactions.push({ assetCode: holder.assetCode, assetIssuer: holder.assetIssuer, transaction: '' });
                }
                await db.run('UPDATE BadgeHolders SET transactions = ? WHERE owner = ?', [
                    JSON.stringify(existingTransactions),
                    holder.owner,
                ]);
            }
            allHolders.push(holder);
        }
    }
    return allHolders;
}
/**
 * Fetch transactions for given badges and holder accounts.
 * @param {any} db - Database connection.
 * @param {Badge[]} badges - List of badges to fetch transactions for.
 * @param {string[]} holderAccounts - List of holder accounts.
 */
export async function fetchTransactions(db, badges, holderAccounts) {
    const assetFilters = [...new Set(badges.map((badge) => `asset[]=${badge.assetCode}-${badge.assetIssuer}-2`))];
    // Filter the holder accounts based on current badge ownership
    const holderAccountsSet = new Set(badges.map((badge) => badge.owner));
    const filteredHolderAccounts = holderAccounts.filter(account => holderAccountsSet.has(account));
    const accountFilters = [...new Set(filteredHolderAccounts.map((account) => `account[]=${account}`))];
    const urlBatches = createUrlBatches(assetFilters, accountFilters);
    for (const urlBatch of urlBatches) {
        await fetchTransactionsForUrlBatch(db, badges, urlBatch);
        await sleep(SLEEP_DURATION_MS);
    }
}
/**
 * Create URL batches for asset and account filters.
 * @param {string[]} assetFilters - List of asset filters.
 * @param {string[]} accountFilters - List of account filters.
 * @returns {string[]} - List of batched URLs.
 */
export function createUrlBatches(assetFilters, accountFilters) {
    console.log('Entering createUrlBatches');
    const batches = [];
    const baseUrl = 'https://api.stellar.expert/explorer/public/tx?order=asc&limit=200';
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
 * @param {any} db - Database connection.
 * @param {Badge[]} badges - List of badges.
 * @param {string} url - URL batch to fetch.
 */
export async function fetchTransactionsForUrlBatch(db, badges, url) {
    let nextUrl = url;
    do {
        console.log(`FETCHING FROM URL: ${nextUrl}`);
        const data = await fetchWithRetry(nextUrl);
        console.log(data);
        await processTransactionRecords(db, badges, data._embedded.records);
        // Check if we need to paginate
        if (data._embedded.records.length < 200) {
            await sleep(SLEEP_DURATION_MS);
            break;
        }
        nextUrl = data._links.next ? BASE_URL + data._links.next.href : null;
        await sleep(SLEEP_DURATION_MS);
    } while (nextUrl);
}
/**
 * Process transaction records and update database.
 * @param {any} db - Database connection.
 * @param {Badge[]} badges - List of badges.
 * @param {any[]} records - List of transaction records to process.
 */
async function processTransactionRecords(db, badges, records) {
    for (const record of records) {
        try {
            console.log('Processing record:', record);
            const envelope = StellarSDK.xdr.TransactionEnvelope.fromXDR(record.body, 'base64');
            let transaction;
            if (envelope.switch().value === StellarSDK.xdr.EnvelopeType.envelopeTypeTx().value) {
                transaction = new StellarSDK.Transaction(envelope, StellarSDK.Networks.PUBLIC);
            }
            else if (envelope.switch().value === StellarSDK.xdr.EnvelopeType.envelopeTypeTxFeeBump().value) {
                transaction = new StellarSDK.FeeBumpTransaction(envelope, StellarSDK.Networks.PUBLIC).innerTransaction;
            }
            else {
                console.log(`Unsupported envelope type: ${envelope.switch()}`);
                continue;
            }
            const paymentOps = transaction.operations.filter(op => op.type === 'payment');
            const txDetails = {
                account_id: '',
                asset_id: '',
                tx_hash: record.hash,
                ledger: record.ledger,
                timestamp: record.ts,
                body: JSON.stringify(transaction),
                meta: record.meta,
                result: record.result,
            };
            let isPaymentProcessed = false;
            for (const badge of badges) {
                if (paymentOps.some((op) => op.destination === badge.owner && op.asset.code === badge.assetCode && op.asset.issuer === badge.assetIssuer)) {
                    updateTransactionHash(badge.transactions, badge.assetCode, badge.assetIssuer, record.hash);
                    console.log('Processed Payment Transaction Details:', JSON.stringify(txDetails, null, 2));
                    await saveTransactionData(db, txDetails);
                    const badgeHolder = await db.get('SELECT * FROM BadgeHolders WHERE owner = ?', [badge.owner]);
                    const transactions = JSON.parse(badgeHolder.transactions);
                    updateTransactionHash(transactions, badge.assetCode, badge.assetIssuer, record.hash);
                    await db.run('UPDATE BadgeHolders SET transactions = ?, lastMarkUrl = ? WHERE owner = ?', [
                        JSON.stringify(transactions),
                        record.paging_token, // Save paging token as marker for incremental update
                        badge.owner,
                    ]);
                    isPaymentProcessed = true;
                }
            }
            if (!isPaymentProcessed) {
                const txMeta = StellarSDK.xdr.TransactionMeta.fromXDR(record.meta, 'base64');
                const claimedBalances = processTransactionMeta(txMeta);
                for (const badge of badges) {
                    const claimedBalance = claimedBalances.find((claimed) => claimed.account === badge.owner && claimed.assetCode === badge.assetCode && claimed.assetIssuer === badge.assetIssuer);
                    if (claimedBalance) {
                        updateTransactionHash(badge.transactions, badge.assetCode, badge.assetIssuer, record.hash);
                        console.log('Processed Claimable Balance Transaction Details:', JSON.stringify(txDetails, null, 2));
                        await saveTransactionData(db, txDetails);
                        const badgeHolder = await db.get('SELECT * FROM BadgeHolders WHERE owner = ?', [badge.owner]);
                        const transactions = JSON.parse(badgeHolder.transactions);
                        updateTransactionHash(transactions, badge.assetCode, badge.assetIssuer, record.hash);
                        await db.run('UPDATE BadgeHolders SET transactions = ?, lastMarkUrl = ? WHERE owner = ?', [
                            JSON.stringify(transactions),
                            record.paging_token, // Save paging token as marker for incremental update
                            badge.owner,
                        ]);
                    }
                }
            }
        }
        catch (error) {
            console.error('Error processing record:', error, 'Record:', JSON.stringify(record, null, 2));
        }
    }
}
/**
 * Save transaction data to the database.
 * @param {any} db - Database connection.
 * @param {any} tx - Transaction data to save.
 */
async function saveTransactionData(db, tx) {
    await db.run(`
    INSERT INTO transactions (account_id, asset_id, tx_hash, ledger, timestamp, body, meta, result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [tx.account_id, tx.asset_id, tx.tx_hash, tx.ledger, tx.timestamp, tx.body, tx.meta, tx.result]);
}
/**
 * Update transaction hash for a badge.
 * @param {object[]} transactions - List of transactions.
 * @param {string} assetCode - Asset code.
 * @param {string} assetIssuer - Asset issuer.
 * @param {string} hash - Transaction hash.
 */
function updateTransactionHash(transactions, assetCode, assetIssuer, hash) {
    const transactionEntry = transactions.find((t) => t.assetCode === assetCode && t.assetIssuer === assetIssuer);
    if (transactionEntry) {
        if (transactionEntry.transaction === '') {
            transactionEntry.transaction = hash;
        }
        else if (transactionEntry.transaction !== hash) {
            console.warn(`Transaction hash conflict for badge: ${assetCode}-${assetIssuer}`);
        }
    }
}
/**
 * Process transaction meta and identify claimed balances.
 * @param {any} txMeta - Transaction meta data.
 * @returns {object[]} - List of claimed balances.
 */
function processTransactionMeta(txMeta) {
    const changes = [];
    // Extract changes from txChangesBefore
    if (Array.isArray(txMeta._value._attributes.txChangesBefore)) {
        txMeta._value._attributes.txChangesBefore.forEach((change) => {
            changes.push(change);
        });
    }
    // Extract changes from operations
    if (Array.isArray(txMeta._value._attributes.operations)) {
        txMeta._value._attributes.operations.forEach((operationMeta) => {
            if (Array.isArray(operationMeta._attributes.changes)) {
                operationMeta._attributes.changes.forEach((change) => {
                    changes.push(change);
                });
            }
        });
    }
    // Extract changes from txChangesAfter
    if (Array.isArray(txMeta._value._attributes.txChangesAfter)) {
        txMeta._value._attributes.txChangesAfter.forEach((change) => {
            changes.push(change);
        });
    }
    const trackedBalances = {};
    changes.forEach(change => {
        const createdBalance = processClaimableBalanceCreation(change);
        if (createdBalance) {
            trackedBalances[createdBalance.balanceId] = createdBalance;
        }
    });
    const claimedBalances = [];
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
function processClaimableBalanceCreation(change) {
    if (change._switch.name === 'ledgerEntryState' &&
        change._arm === 'state' &&
        change._value &&
        change._value._attributes &&
        change._value._attributes.data &&
        change._value._attributes.data._switch.name === 'claimableBalance' &&
        change._value._attributes.data._arm === 'claimableBalance') {
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
function isClaimableBalanceClaimed(change, trackedBalances) {
    if (change._switch.name === 'ledgerEntryRemoved' &&
        change._arm === 'removed' &&
        change._value &&
        change._value._switch.name === 'claimableBalance' &&
        change._value._arm === 'claimableBalance') {
        const balanceIdBuffer = change._value._value._attributes.balanceId._value;
        const balanceId = Buffer.from(balanceIdBuffer).toString('hex');
        const trackedBalance = trackedBalances[balanceId];
        if (trackedBalance && trackedBalance.claimants) {
            const claimant = trackedBalance.claimants.find((c) => {
                return (c._value &&
                    c._value._attributes &&
                    c._value._attributes.destination &&
                    trackedBalance.claimants.some((tc) => Buffer.compare(tc._value._attributes.destination._value, c._value._attributes.destination._value) === 0));
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
function bufferToString(buffer) {
    return String.fromCharCode(...buffer).replace(/\0/g, '');
}
