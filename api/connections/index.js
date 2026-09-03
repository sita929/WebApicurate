const { verifyCredentials } = require('../verify');
const { saveConnection, listConnections, deleteConnection } = require('../store');

/* /api/connections

   POST   verify the credentials, then store the key in Key Vault and
          the row in Azure SQL. Returns the stored record, never the key.
   GET    list the caller's connections (?username= in dev).
   DELETE remove one (?id=).

   The key exists in this process only for the probe and the vault
   write. It is never logged, never written to SQL, never returned. */

/* On Static Web Apps the platform injects x-ms-client-principal once
   auth is configured; trust that over anything the client sends. */
function usernameFrom(req) {
  const header = req.headers && req.headers['x-ms-client-principal'];
  if (header) {
    try {
      const principal = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
      if (principal && principal.userDetails) return principal.userDetails;
    } catch { /* fall through */ }
  }
  const body = req.body || {};
  const query = req.query || {};
  return body.username || query.username || '';
}

module.exports = async function (context, req) {
  const username = usernameFrom(req);
  const json = (status, body) => {
    context.res = { status, headers: { 'Content-Type': 'application/json' }, body };
  };

  if (!username) return json(400, { ok: false, message: 'No user identified.' });

  try {
    if (req.method === 'GET') {
      const result = await listConnections(username);
      return json(200, { ok: true, ...result });
    }

    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id) || (req.body && req.body.id);
      if (!id) return json(400, { ok: false, message: 'id is required.' });
      const result = await deleteConnection(username, id);
      context.log(`connections: delete ${username}/${id} -> ${result.stored ? 'ok' : result.reason}`);
      return json(200, { ok: true, ...result });
    }

    if (req.method === 'POST') {
      const { provider, api, name, baseUrl, key } = req.body || {};

      const verdict = await verifyCredentials({ provider, baseUrl, key });
      context.log(`connections: verify ${provider} for ${username} -> ${verdict.ok ? 'ok' : 'rejected'}`);
      if (!verdict.ok) return json(200, { ok: false, verified: false, message: verdict.message });

      const stored = await saveConnection({ username, provider, api, name, baseUrl, key });
      context.log(`connections: store ${provider} for ${username} -> secret=${stored.secretStored} row=${stored.rowStored}${stored.reason ? ' (' + stored.reason + ')' : ''}`);

      return json(200, {
        ok: true,
        verified: true,
        stored: stored.stored,
        secretStored: stored.secretStored,
        rowStored: stored.rowStored,
        reason: stored.reason,
        secretName: stored.secretName,
        id: stored.id
      });
    }

    return json(405, { ok: false, message: 'Method not allowed.' });
  } catch (err) {
    context.log.error ? context.log.error(err.message) : context.log(err.message);
    return json(500, { ok: false, message: `Server error: ${err.message}` });
  }
};
