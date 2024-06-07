import { NextApiRequest, NextApiResponse } from 'next';
import { openDb } from '../../../lib/initDb';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const db = await openDb();
  const badges = await db.all('SELECT * FROM badges');
  res.status(200).json(badges);
}
