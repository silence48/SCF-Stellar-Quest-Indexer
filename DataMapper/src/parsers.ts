import * as toml from 'toml';
import { connectToDb, initDb } from './database.js';

export async function parseTomlFiles(db: any, urls: string[]) {
  for (const url of urls) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      const data = toml.parse(text);
      const currencies = data.CURRENCIES || [];

      for (const currency of currencies) {
        const exists = await db.collection('badges').findOne({ code: currency.code, issuer: currency.issuer });
        if (!exists) {
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

          await db.collection('badges').insertOne(badge);
        }
      }
    } catch (error) {
      console.error(`Failed to fetch or parse TOML from ${url}:`, error);
    }
  }
}
