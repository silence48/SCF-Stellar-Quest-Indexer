async function testApi() {
    const response = await fetch('http://localhost:5442/verifyPathfinder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        authentication: 'AAAAAgAAAAB/ivbwebT2hlVtU0uey3o7bf6CX1Io9JkolI0f8Jzr6QAAAGQAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAABmiCTQAAAAAAAAAAEAAAAAAAAACgAAABI3NTU4NTE5Mjg0NjE5MDE5MzYAAAAAAAEAAAALMTIzNDU2Nzg5MDEAAAAAAAAAAAHwnOvpAAAAQH/ivMdq22LuaQY2cZYzfVNiZZOIDFKcutv3+0QCwRwxqDZOIk3YgYDd3HnrGM/75bHl6IMUvVUD0loNGYkrnQ4=',
        address: 'users-stellar-address',
        discordId: 'users-discord-id',
      }),
    });
  
    const data = await response.json();
    console.log('Response:', data);
  }
  
  testApi();
  