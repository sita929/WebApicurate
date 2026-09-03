/* GET /api/ping — deployment probe.

   Deliberately has no dependencies and touches no config, so it answers
   even when Key Vault, SQL or the npm install are broken. If this responds
   but /api/connections doesn't, the Functions deployed and something inside
   that function is failing. If this 404s, the API was never deployed. */
module.exports = async function (context, req) {
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      ok: true,
      service: 'apiqurate-api',
      node: process.version,
      keyVaultConfigured: Boolean(process.env.KEY_VAULT_URI),
      sqlConfigured: Boolean(process.env.SQL_CONNECTION_STRING),
      time: new Date().toISOString()
    }
  };
};
