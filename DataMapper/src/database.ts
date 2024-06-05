import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

export async function openDb() {
  return open({
    filename: './assets.db',
    driver: sqlite3.Database,
  });
}

export async function initDb() {
  const db = await openDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT,
      issuer TEXT,
      difficulty TEXT,
      subDifficulty TEXT,
      category_broad TEXT,
      category_narrow TEXT,
      description_short TEXT,
      description_long TEXT,
      current INTEGER,
      instructions TEXT,
      issue_date TEXT,
      image TEXT,
      type TEXT,
      aliases TEXT,
      lastMarkUrlHolders TEXT,
      lastMarkUrlTransactions TEXT
    );

    CREATE TABLE IF NOT EXISTS BadgeHolders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner TEXT,
      transactions TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT,
      badge_id INTEGER,
      tx_hash TEXT,
      ledger INTEGER,
      timestamp INTEGER,
      body TEXT,
      meta TEXT,
      result TEXT,
      FOREIGN KEY (badge_id) REFERENCES badges(id)
    );
  `);

  return db;
}

export async function fetchAssetsFromDb(assetLimit: number) {
  const db = await openDb();
  return db.all('SELECT DISTINCT code, issuer FROM badges LIMIT ?', assetLimit);
}
