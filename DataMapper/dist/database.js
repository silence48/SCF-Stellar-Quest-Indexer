import { MongoClient } from 'mongodb';
const uri = "mongodb://192.168.1.175:27017";
const dbName = 'stellarDB';
let db;
export async function connectToDb() {
    if (!db) {
        const client = new MongoClient(uri);
        await client.connect();
        db = client.db(dbName);
    }
    return db;
}
export async function initDb() {
    const db = await connectToDb();
    await db.collection('badges').createIndex({ code: 1, issuer: 1 }, { unique: true });
    await db.collection('BadgeHolders').createIndex({ owner: 1 }, { unique: true });
    await db.collection('transactions').createIndex({ tx_hash: 1 }, { unique: true });
    return db;
}
export async function fetchAssetsFromDb(db, assetLimit) {
    const assets = await db.collection('badges').find().limit(assetLimit).toArray();
    return assets.map((asset) => ({
        code: asset.code,
        issuer: asset.issuer
    }));
}
