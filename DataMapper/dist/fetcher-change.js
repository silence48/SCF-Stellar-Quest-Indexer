import * as StellarSDK from '@stellar/stellar-sdk';
import { openDb } from './databaseold.js';
import { sleep } from './utils.js';
const API_KEY = `Bearer ${process.env.API_KEY || ''}`;
const BASE_URL = 'https://api.stellar.expert';
const MAX_FILTERS = 10;
const SLEEP_DURATION_MS = 200;
// Add this function to fetch transactions for a single holder
export async function fetchTransactionsForHolder(db, address) {
    const assetFilters = [];
    const accountFilters = [`account[]=${address}`];
    // Fetch all badges from the database
    const badges = await db.all('SELECT * FROM badges');
    badges.forEach((badge) => {
        assetFilters.push(badge);
    });
    const urlBatches = createUrlBatches(assetFilters, accountFilters);
    const allTransactions = [];
    for (const urlBatch of urlBatches) {
        const data = await fetchTransactionsForUrlBatch(db, urlBatch);
        if (data) {
            allTransactions.push(...data);
        }
        await sleep(200); // Sleep to prevent rate limiting
    }
    return allTransactions;
}
/**
 * Fetch data from a URL with retry on failure.
 * @param {string} url - The URL to fetch data from.
 * @returns {Promise<any>} - The JSON response from the fetch.
 * @throws Will throw an error if the fetch fails.
 */
async function fetchWithRetry(url) {
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
    }
    catch (error) {
        throw new Error(`Failed to fetch ${url}: ${error.message}`);
    }
}
/**
 * Fetch asset holders for a given asset with pagination.
 * @param {Asset} asset - The asset to fetch holders for.
 * @returns {Promise<Badge[]>} - A list of badges for asset holders.
 */
export async function fetchAssetHolders(asset) {
    let allHolders = [];
    const db = await openDb();
    const assetData = await db.get('SELECT * FROM badges WHERE code = ? AND issuer = ?', [asset.code, asset.issuer]);
    let nextUrl = assetData?.lastMarkUrlHolders ? `${BASE_URL}${assetData.lastMarkUrlHolders}` : `${BASE_URL}/explorer/public/asset/${asset.code}-${asset.issuer}/holders?order=desc&limit=200`;
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
                transactions: [{ badgeId: assetData.id, tx: '' }], // Placeholder for transaction
            }));
            allHolders = allHolders.concat(holders);
            // Paginate
            if (data._embedded.records.length < 200) {
                nextUrl = null;
            }
            else {
                nextUrl = BASE_URL + data._links.next.href;
            }
            // Update the lastMarkUrlHolders in the badges table
            await db.run('UPDATE badges SET lastMarkUrlHolders = ? WHERE code = ? AND issuer = ?', [data._links.self.href, asset.code, asset.issuer]);
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
        //console.log(holders);
        for (const holder of holders) {
            const existingHolder = await db.get('SELECT * FROM BadgeHolders WHERE owner = ?', [holder.owner]);
            if (!existingHolder) {
                await db.run('INSERT INTO BadgeHolders (owner, transactions) VALUES (?, ?)', [
                    holder.owner,
                    JSON.stringify([{ badgeId: holder.transactions[0].badgeId, tx: '' }]),
                ]);
            }
            else {
                // Existing holder, check and update transactions array
                const existingTransactions = JSON.parse(existingHolder.transactions);
                let transactionUpdated = false;
                for (const entry of existingTransactions) {
                    if (entry.badgeId === holder.transactions[0].badgeId) {
                        if (entry.tx === '') {
                            entry.tx = ''; // This will be updated later when processing transactions
                        }
                        transactionUpdated = true;
                    }
                }
                if (!transactionUpdated) {
                    existingTransactions.push({ badgeId: holder.transactions[0].badgeId, tx: '' });
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
 * @param {Badge[]} holders - List of holders to fetch transactions for.
 */
export async function fetchTransactions(db, holders) {
    const badges = await db.all('SELECT * FROM badges');
    const badgeMap = new Map();
    badges.forEach((badge) => {
        if (!badgeMap.has(badge.code)) {
            badgeMap.set(badge.code, []);
        }
        badgeMap.get(badge.code)?.push(badge);
    });
    const urlBatches = createUrlBatches(holders, badgeMap);
    for (const urlBatch of urlBatches) {
        await fetchTransactionsForUrlBatch(db, urlBatch);
        await sleep(SLEEP_DURATION_MS);
    }
}
/**
 * Create URL batches for asset and account filters.
 * @param {Badge[]} holders - List of holders to fetch transactions for.
 * @param {Map<string, any[]>} badgeMap - Map of badge codes to badges.
 * @returns {string[]} - List of batched URLs.
 */
export function createUrlBatches(holders, badgeMap) {
    console.log('Entering createUrlBatches');
    const batches = [];
    const baseUrl = 'https://api.stellar.expert/explorer/public/tx?order=asc&limit=200';
    for (const [badgeCode, badges] of badgeMap.entries()) {
        const holderAccounts = holders.filter(holder => holder.assetCode === badgeCode).map(holder => holder.owner);
        for (let i = 0; i < holderAccounts.length; i += MAX_FILTERS) {
            const accountBatch = holderAccounts.slice(i, i + MAX_FILTERS).join('&account[]=');
            const url = `${baseUrl}&asset[]=${badgeCode}-${badges[0].assetIssuer}-2&account[]=${accountBatch}`;
            batches.push(url);
        }
    }
    console.log(`Created ${batches.length} URL batches`);
    return batches;
}
/**
 * Fetch transactions for a batch of URLs.
 * @param {any} db - Database connection.
 * @param {string} url - URL batch to fetch.
 * @returns {Promise<any[]>} - List of transaction records.
 */
export async function fetchTransactionsForUrlBatch(db, url) {
    let nextUrl = url;
    const transactions = [];
    do {
        console.log(`FETCHING FROM URL: ${nextUrl}`);
        const data = await fetchWithRetry(nextUrl);
        transactions.push(...data._embedded.records);
        await processTransactionRecords(db, data._embedded.records);
        // Check if we need to paginate
        if (data._embedded.records.length < 200) {
            nextUrl = null;
        }
        else {
            nextUrl = BASE_URL + data._links.next.href;
        }
        await sleep(SLEEP_DURATION_MS);
    } while (nextUrl);
    return transactions;
}
/**
 * Process transaction records and update database.
 * @param {any} db - Database connection.
 * @param {any[]} records - List of transaction records to process.
 */
async function processTransactionRecords(db, records) {
    for (const record of records) {
        try {
            //console.log('Processing record:', record);
            const envelope = StellarSDK.xdr.TransactionEnvelope.fromXDR(record.body, 'base64');
            let transaction;
            if (envelope.switch().value === StellarSDK.xdr.EnvelopeType.envelopeTypeTx().value) {
                transaction = new StellarSDK.Transaction(envelope, StellarSDK.Networks.PUBLIC);
            }
            else if (envelope.switch().value === StellarSDK.xdr.EnvelopeType.envelopeTypeTxFeeBump().value) {
                transaction = new StellarSDK.FeeBumpTransaction(envelope, StellarSDK.Networks.PUBLIC).innerTransaction;
            }
            else {
                console.warn(`Unsupported envelope type: ${envelope.switch()}`);
                continue;
            }
            const paymentOps = transaction.operations.filter(op => op.type === 'payment');
            const txDetails = {
                account_id: '',
                badge_id: 0,
                tx_hash: record.hash,
                ledger: record.ledger,
                timestamp: record.ts,
                body: JSON.stringify(transaction),
                meta: record.meta,
                result: record.result,
            };
            let isPaymentProcessed = false;
            for (const op of paymentOps) {
                const badge = await db.get('SELECT * FROM badges WHERE code = ? AND issuer = ?', [op.asset.code, op.asset.issuer]);
                if (badge) {
                    txDetails.account_id = op.destination;
                    txDetails.badge_id = badge.id;
                    const badgeHolder = await db.get('SELECT * FROM BadgeHolders WHERE owner = ?', [op.destination]);
                    const transactions = JSON.parse(badgeHolder.transactions);
                    updateTransactionHash(transactions, badge.id, record.hash);
                    await saveTransactionData(db, txDetails);
                    await db.run('UPDATE BadgeHolders SET transactions = ?, lastMarkUrl = ? WHERE owner = ?', [
                        JSON.stringify(transactions),
                        record.paging_token, // Save paging token as marker for incremental update
                        op.destination,
                    ]);
                    isPaymentProcessed = true;
                }
            }
            if (!isPaymentProcessed) {
                const txMeta = StellarSDK.xdr.TransactionMeta.fromXDR(record.meta, 'base64');
                const claimedBalances = processTransactionMeta(txMeta);
                for (const claimed of claimedBalances) {
                    const badge = await db.get('SELECT * FROM badges WHERE code = ? AND issuer = ?', [claimed.assetCode, claimed.assetIssuer]);
                    if (badge) {
                        txDetails.account_id = claimed.account;
                        txDetails.badge_id = badge.id;
                        const badgeHolder = await db.get('SELECT * FROM BadgeHolders WHERE owner = ?', [claimed.account]);
                        const transactions = JSON.parse(badgeHolder.transactions);
                        updateTransactionHash(transactions, badge.id, record.hash);
                        await saveTransactionData(db, txDetails);
                        await db.run('UPDATE BadgeHolders SET transactions = ?, lastMarkUrl = ? WHERE owner = ?', [
                            JSON.stringify(transactions),
                            record.paging_token, // Save paging token as marker for incremental update
                            claimed.account,
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
    INSERT INTO transactions (account_id, badge_id, tx_hash, ledger, timestamp, body, meta, result)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [tx.account_id, tx.badge_id, tx.tx_hash, tx.ledger, tx.timestamp, tx.body, tx.meta, tx.result]);
}
/**
 * Update transaction hash for a badge.
 * @param {object[]} transactions - List of transactions.
 * @param {number} badgeId - Badge ID.
 * @param {string} hash - Transaction hash.
 */
function updateTransactionHash(transactions, badgeId, hash) {
    const transactionEntry = transactions.find((t) => t.badgeId === badgeId);
    if (transactionEntry) {
        if (transactionEntry.tx === '') {
            transactionEntry.tx = hash;
        }
        else if (transactionEntry.tx !== hash) {
            console.warn(`Transaction hash conflict for badge ID: ${badgeId}`);
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
    if (Array.isArray(txMeta.value().txChangesBefore())) {
        txMeta.value().txChangesBefore().forEach((change) => {
            changes.push(change);
        });
    }
    // Extract changes from operations
    if (Array.isArray(txMeta.value().operations())) {
        txMeta.value().operations().forEach((operationMeta) => {
            if (Array.isArray(operationMeta.changes())) {
                operationMeta.changes().forEach((change) => {
                    changes.push(change);
                });
            }
        });
    }
    // Extract changes from txChangesAfter
    if (Array.isArray(txMeta.value().txChangesAfter())) {
        txMeta.value().txChangesAfter().forEach((change) => {
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
