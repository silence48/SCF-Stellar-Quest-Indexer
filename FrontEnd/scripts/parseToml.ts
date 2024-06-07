const toml = require('toml');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const openDb = async () => {
  return open({
    filename: './badges.db',
    driver: sqlite3.Database,
  });
};

const initDb = async () => {
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
};

const parseTomlFiles = async (urls: string[]) => {
  const db = await initDb();

  for (const url of urls) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      const data = toml.parse(text);
      const currencies = data.CURRENCIES || [];

      for (const currency of currencies) {
        const badge = {
          code: currency.code || '',
          issuer: currency.issuer || '',
          difficulty: '',
          subDifficulty: '',
          category_broad: '',
          category_narrow: '',
          description_short: currency.name || '',
          description_long: currency.desc || '',
          current: 1, // Defaulting to true, change as needed
          instructions: '',
          issue_date: new Date().toISOString(),
          type: '',
          aliases: [],
          image: currency.image || ''
        };

        await db.run(
          `INSERT INTO badges (code, issuer, difficulty, subDifficulty, category_broad, category_narrow, 
            description_short, description_long, current, instructions, issue_date, type, aliases, image) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [badge.code, badge.issuer, badge.difficulty, badge.subDifficulty, badge.category_broad, badge.category_narrow,
          badge.description_short, badge.description_long, badge.current, badge.instructions, badge.issue_date, badge.type, JSON.stringify(badge.aliases), badge.image]
        );
      }
    } catch (error) {
      console.error(`Failed to fetch or parse TOML from ${url}:`, error);
    }
  }
};

// Example usage
parseTomlFiles([
  'https://quest.stellar.org/.well-known/stellar.toml',
  'https://fastcheapandoutofcontrol.com/.well-known/stellar.toml'
]);
