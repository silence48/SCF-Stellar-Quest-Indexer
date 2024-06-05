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
            choices: ['Parse-Badges', 'Index-Asset-Holders', 'Index-Asset-Holder-Metadata', 'Index-All-Holders-All-Assets'],
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
        await parseTomlFiles(badgeUrls);
        console.log('Badges parsed successfully.');
    }
    else {
        let assets = [];
        if (option === 'Index-All-Holders-All-Assets') {
            assets = await fetchAssetsFromDb(0); // Fetch all assets since assetLimit is set to 0
        }
        else {
            assets = await fetchAssetsFromDb(assetLimit);
        }
        if (option === 'Index-Asset-Holders' || option === 'Index-All-Holders-All-Assets') {
            console.log('Fetching and indexing asset holders...');
            const holders = await fetchAllAssetHolders(assets);
            console.log('Asset Holders:', JSON.stringify(holders, null, 2));
        }
        else if (option === 'Index-Asset-Holder-Metadata') {
            console.log('Fetching and indexing asset holder metadata...');
            const holders = await fetchAllAssetHolders(assets);
            console.log('Account Holders:', JSON.stringify(holders, null, 2));
            await fetchTransactions(db, holders);
            console.log('Data fetching completed.');
        }
    }
}
main().catch(error => console.error('Error in main function:', error));
