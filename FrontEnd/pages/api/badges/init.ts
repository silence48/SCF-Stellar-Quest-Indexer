import { NextApiRequest, NextApiResponse } from 'next';
import { initDb } from '../../../lib/initDb';
import { parseTomlFiles } from '../../../lib/parseToml';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await initDb();
  await parseTomlFiles([
    'https://quest.stellar.org/.well-known/stellar.toml',
    'https://fastcheapandoutofcontrol.com/.well-known/stellar.toml'
  ]);
  res.status(200).json({ message: 'Badges initialized' });
}
