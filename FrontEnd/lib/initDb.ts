const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

export async function openDb() {
  return open({
    filename: './badges.db',
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
      aliases TEXT
    )
  `);
  return db;
}
