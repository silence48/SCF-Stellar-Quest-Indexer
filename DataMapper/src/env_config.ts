import { Keypair, SorobanRpc } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

class EnvConfig {
    rpc: SorobanRpc.Server;
    passphrase: string;
    api_key: string;
    authtoken: string;
    db_password: string;
  
    constructor(
      rpc: SorobanRpc.Server,
      passphrase: string,
      api_key: string,
      authtoken: string,
      db_password: string,
    ) {
      this.rpc = rpc;
      this.passphrase = passphrase;
      this.api_key = api_key;
      this.authtoken = authtoken;
      this.db_password = db_password;
    }
  
    /**
     * Load the environment config from the .env file
     * @returns Environment config
     */
    static loadFromFile(): EnvConfig {
      const rpc_url = process.env.RPC_URL;
      const passphrase = process.env.NETWORK_PASSPHRASE;
      const api_key = process.env.API_KEY;
      const authtoken = process.env.AUTH_TOKEN;
      const db_password = process.env.DB_PASSWORD
  
      if (
        rpc_url == undefined ||
        passphrase == undefined ||
        api_key == undefined ||
        authtoken == undefined ||
        db_password == undefined 
      ) {
        throw new Error('Error: .env file is missing required fields');
      }
  
      return new EnvConfig(
        new SorobanRpc.Server(rpc_url, { allowHttp: true }),
        passphrase,
        api_key,
        authtoken,
        db_password
      );
    }
  }
  
  export const config = EnvConfig.loadFromFile();
  