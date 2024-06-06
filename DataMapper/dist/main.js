import inquirer from 'inquirer';
import { initDb, fetchAssetsFromDb } from './database.js';
import { parseTomlFiles } from './parsers.js';
import { fetchAllAssetHolders, fetchTransactions } from './fetchers.js';
async function main() {
    const db = await initDb();
    const answers = await inquirer.prompt([
        {
            type: 'list',
            name: 'option',
            message: 'Select an option:',
            choices: ['Parse-Badges', 'Index-Asset-Holders', 'Index-Asset-Holder-Metadata', 'Index-All-Holders-All-Assets', 'Drop-Transactions-Table'],
        },
        {
            type: 'number',
            name: 'assetLimit',
            message: 'Enter the number of assets to parse (for testing):',
            validate: (input) => Number.isInteger(input) && input > 0 ? true : 'Please enter a valid number',
            when: (answers) => answers.option !== 'Parse-Badges' && answers.option !== 'Index-All-Holders-All-Assets',
        },
    ]);
    const option = answers.option;
    const assetLimit = answers.assetLimit;
    if (option === 'Parse-Badges') {
        const badgeUrls = [
            'https://quest.stellar.org/.well-known/stellar.toml',
            'https://fastcheapandoutofcontrol.com/.well-known/stellar.toml'
        ];
        console.log('Parsing badges...');
        await parseTomlFiles(db, badgeUrls);
        console.log('Badges parsed successfully.');
    }
    else {
        let assets = [];
        if (option === 'Drop-Transactions-Table') {
            await db.collection('transactions').drop();
        }
        if (option === 'Index-All-Holders-All-Assets') {
            assets = await fetchAssetsFromDb(db, 5000); // Fetch all assets since assetLimit is set to 5000
        }
        else {
            assets = await fetchAssetsFromDb(db, assetLimit);
        }
        if (option === 'Index-Asset-Holders' || option === 'Index-All-Holders-All-Assets') {
            console.log('Fetching and indexing asset holders...');
            const holders = await fetchAllAssetHolders(db, assets, true);
            console.log('Asset Holders:', holders.length);
        }
        else if (option === 'Index-Asset-Holder-Metadata') {
            console.log('Fetching and indexing asset holder metadata...');
            const holders = await fetchAllAssetHolders(db, assets, false);
            console.log('Account Holders:', holders.length);
            await fetchTransactions(db, holders);
            console.log('Data fetching completed.');
        }
    }
}
main().catch(error => console.error('Error in main function:', error));
