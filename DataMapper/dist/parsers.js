import * as toml from 'toml';
import { openDb } from './database.js';
export async function parseTomlFiles(urls) {
    const db = await openDb();
    for (const url of urls) {
        try {
            const response = await fetch(url);
            const text = await response.text();
            const data = toml.parse(text);
            const currencies = data.CURRENCIES || [];
            for (const currency of currencies) {
                const exists = await db.get('SELECT 1 FROM badges WHERE code = ? AND issuer = ?', [currency.code, currency.issuer]);
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
                    await db.run(`INSERT INTO badges (code, issuer, difficulty, subDifficulty, category_broad, category_narrow, 
              description_short, description_long, current, instructions, issue_date, type, aliases, image) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [badge.code, badge.issuer, badge.difficulty, badge.subDifficulty, badge.category_broad, badge.category_narrow,
                        badge.description_short, badge.description_long, badge.current, badge.instructions, badge.issue_date, badge.type, JSON.stringify(badge.aliases), badge.image]);
                }
            }
        }
        catch (error) {
            console.error(`Failed to fetch or parse TOML from ${url}:`, error);
        }
    }
}
