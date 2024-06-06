import { SorobanRpc } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });
class EnvConfig {
    constructor(rpc, passphrase, api_key, authtoken) {
        this.rpc = rpc;
        this.passphrase = passphrase;
        this.api_key = api_key;
        this.authtoken = authtoken;
    }
    /**
     * Load the environment config from the .env file
     * @returns Environment config
     */
    static loadFromFile() {
        const rpc_url = process.env.RPC_URL;
        const passphrase = process.env.NETWORK_PASSPHRASE;
        const api_key = process.env.API_KEY;
        const authtoken = process.env.authtoken;
        if (rpc_url == undefined ||
            passphrase == undefined ||
            api_key == undefined ||
            authtoken == undefined) {
            throw new Error('Error: .env file is missing required fields');
        }
        return new EnvConfig(new SorobanRpc.Server(rpc_url, { allowHttp: true }), passphrase, api_key, authtoken);
    }
}
export const config = EnvConfig.loadFromFile();
