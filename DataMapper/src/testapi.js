import { config } from './env_config.js';

async function testApi() {
    const response = await fetch('http://localhost:5442/verifyPathfinder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        authentication: config.authtoken,
        address: 'users-stellar-address',
        discordId: 'users-discord-id',
      }),
    });
  
    const data = await response.json();
    console.log('Response:', data);
  }
  
  testApi();
  