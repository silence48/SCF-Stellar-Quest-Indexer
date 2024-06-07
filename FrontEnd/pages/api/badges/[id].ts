import { NextApiRequest, NextApiResponse } from 'next';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const openDb = async () => {
  return open({
    filename: './badges.db',
    driver: sqlite3.Database
  });
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb();
  
  if (req.method === 'PUT') {
    const { id } = req.query;
    const { code, issuer, difficulty, subDifficulty, category_broad, category_narrow, description_short, description_long, current, instructions, issue_date, image, type, aliases } = req.body;

    const parsedAliases = Array.isArray(aliases) ? JSON.stringify(aliases) : aliases;

    await db.run(
      `UPDATE badges SET code = ?, issuer = ?, difficulty = ?, subDifficulty = ?, category_broad = ?, category_narrow = ?, 
        description_short = ?, description_long = ?, current = ?, instructions = ?, issue_date = ?, image = ?, type = ?, aliases = ? 
        WHERE id = ?`,
      [code, issuer, difficulty, subDifficulty, category_broad, category_narrow, description_short, description_long, current ? 1 : 0, instructions, issue_date, image, type, parsedAliases, id]
    );
    res.status(200).json({ message: 'Badge updated successfully' });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
}
