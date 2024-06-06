import { MongoClient, Db, Document } from 'mongodb';
import { Asset } from './fetchers.js'
import { config } from './env_config.js';


//const uri = "mongodb://192.168.1.175:27017"; use this if you don't have a password.
const uri = `mongodb://dbUser:${config.db_password}@192.168.1.175:27017/myDatabase?authSource=admin`;

const dbName = 'stellarDB';

let db: Db;

export async function connectToDb(): Promise<Db> {
  if (!db) {
    const client = new MongoClient(uri);
    await client.connect();
    db = client.db(dbName);
  }
  return db;
}

export async function initDb(): Promise<Db> {
  const db = await connectToDb();
  await db.collection('badges').createIndex({ code: 1, issuer: 1 }, { unique: true });
  await db.collection('BadgeHolders').createIndex({ owner: 1 }, { unique: true });
  await db.collection('transactions').createIndex({ tx_hash: 1 }, { unique: true });
  return db;
}

export async function fetchAssetsFromDb(db: Db, assetLimit: number): Promise<Asset[]> {
  const assets = await db.collection('badges').find().limit(assetLimit).toArray();
  return assets.map((asset: Document) => ({
    code: asset.code,
    issuer: asset.issuer
  })) as Asset[];
}
