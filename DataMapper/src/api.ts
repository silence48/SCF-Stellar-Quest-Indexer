import express from 'express';
import bodyParser from 'body-parser';
import { openDb } from './database.js';
import { fetchTransactionsForHolder } from './fetchers.js';


const authtoken = `Bearer ${process.env.authtoken || ''}`;

const app = express();
const PORT = 5442;

const AUTH_TOKENS = new Set([
    process.env.authtoken
]);

app.use(bodyParser.json());

app.post('/verifyPathfinder', async (req, res) => {
  const { authentication, address, discordId } = req.body;

  if (!AUTH_TOKENS.has(authentication)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = await openDb();
    const transactions = await fetchTransactionsForHolder(db, address);

    const badges = transactions.map(tx => ({
      badge: `${tx.assetCode}:${tx.assetIssuer}`,
      txhash: tx.tx_hash,
      questid: tx.badge_id,
    }));

    res.json({
      quests: badges,
      totalReputation: '',
      scfRole: '',
      roleAssigned: true,
    });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
