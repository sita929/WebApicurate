const { verifyCredentials } = require('../verify');

/* POST /api/verify-connection
   Body: { provider, baseUrl, key }
   Returns 200 { ok: true } or 200 { ok: false, message }.

   Always answers 200 so the browser can show the provider's own reason;
   transport failures are the only 5xx. The key is never logged. */
module.exports = async function (context, req) {
  const { provider, baseUrl, key } = req.body || {};

  const result = await verifyCredentials({ provider, baseUrl, key });

  context.log(`verify-connection: ${provider} -> ${result.ok ? 'ok' : 'rejected'}`);

  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: result
  };
};
