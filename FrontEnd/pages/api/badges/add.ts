import { NextApiRequest, NextApiResponse } from 'next';
import { openDb } from '../../../lib/initDb';

export default async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const db = await openDb();
    const { code, issuer, difficulty, subDifficulty, category_broad, category_narrow, description_short, description_long, current, instructions, issue_date, image, type, aliases } = req.body;

    const result = await db.run(
      `INSERT INTO badges (code, issuer, difficulty, subDifficulty, category_broad, category_narrow, description_short, description_long, current, instructions, issue_date, image, type, aliases) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [code, issuer, difficulty, subDifficulty, category_broad, category_narrow, description_short, description_long, current ? 1 : 0, instructions, issue_date, image, type, JSON.stringify(aliases)]
    );

    res.status(201).json({ id: result.lastID });
  } else {
    res.status(405).json({ message: 'Method not allowed' });
  }
};
