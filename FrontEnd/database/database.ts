import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { Database } from 'sqlite';

const openDb = async () => {
  return open({
    filename: './badges.db',
    driver: sqlite3.Database
  });
};

const initDb = async () => {
  const db = await openDb();
  await db.exec(`CREATE TABLE IF NOT EXISTS badges (
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
    aliases TEXT
  )`);
  return db;
};

export { openDb, initDb };
