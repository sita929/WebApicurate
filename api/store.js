/* ============================================================
   Persistence — Key Vault for secrets, Azure SQL for the control
   table that drives the Data Factory pipeline.

   The API key is written to Key Vault and NEVER stored in SQL or
   returned to the browser. SQL holds only the secret's *name*, which
   is what the ADF linked service resolves at runtime.

   Config (Static Web App → Configuration → Application settings):
     KEY_VAULT_URI          https://<vault>.vault.azure.net
     SQL_CONNECTION_STRING  Server=tcp:<srv>.database.windows.net,1433;Database=...

   Credentials for Key Vault come from DefaultAzureCredential, which
   picks up a managed identity when one exists, otherwise the
   AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET app settings.

   Every dependency is loaded lazily so the app still runs (verify-only,
   no persistence) on a machine where the Azure SDKs aren't installed.
   ============================================================ */

const KEY_VAULT_URI = process.env.KEY_VAULT_URI || '';
const SQL_CONNECTION_STRING = process.env.SQL_CONNECTION_STRING || '';

/* ---------- Naming ---------- */

/* Key Vault secret names allow only alphanumerics and dashes.
   Convention: <provider>--<username>, e.g. hubspot--TestUserSuman */
function secretNameFor(provider, username) {
  const clean = s => String(s).replace(/[^0-9a-zA-Z-]/g, '-').replace(/-+/g, '-');
  return `${clean(provider).toLowerCase()}--${clean(username)}`.slice(0, 127);
}

/* ---------- Availability ---------- */

function missingConfig() {
  const missing = [];
  if (!KEY_VAULT_URI) missing.push('KEY_VAULT_URI');
  if (!SQL_CONNECTION_STRING) missing.push('SQL_CONNECTION_STRING');
  return missing;
}

function tryRequire(name) {
  try { return require(name); } catch { return null; }
}

/* Returns null when ready, or a human-readable reason it isn't. */
function storageUnavailable() {
  const missing = missingConfig();
  if (missing.length) return `not configured (${missing.join(', ')})`;

  for (const mod of ['@azure/identity', '@azure/keyvault-secrets', 'mssql']) {
    if (!tryRequire(mod)) return `dependency "${mod}" is not installed (run npm install in api/)`;
  }
  return null;
}

/* ---------- Key Vault ---------- */

let secretClient = null;

function vault() {
  if (!secretClient) {
    const { DefaultAzureCredential } = require('@azure/identity');
    const { SecretClient } = require('@azure/keyvault-secrets');
    secretClient = new SecretClient(KEY_VAULT_URI, new DefaultAzureCredential());
  }
  return secretClient;
}

/* ---------- SQL ---------- */

let poolPromise = null;

function sqlPool() {
  const sql = require('mssql');
  if (!poolPromise) {
    poolPromise = sql.connect(SQL_CONNECTION_STRING);
    poolPromise.catch(() => { poolPromise = null; });  // let the next call retry
  }
  return poolPromise;
}

/* ---------- Operations ---------- */

/* Store the key in Key Vault, then upsert the control-table row.
   Key Vault first: a stranded secret is harmless, a SQL row pointing
   at a secret that doesn't exist would break the pipeline. */
async function saveConnection({ username, provider, api, name, baseUrl, key }) {
  const reason = storageUnavailable();
  if (reason) return { stored: false, reason };

  const sql = require('mssql');
  const secretName = secretNameFor(provider, username);

  await vault().setSecret(secretName, key, {
    tags: { provider, username, app: 'apiqurate' }
  });

  const pool = await sqlPool();
  const result = await pool.request()
    .input('Username', sql.NVarChar(100), username)
    .input('Provider', sql.NVarChar(50), provider)
    .input('ApiName', sql.NVarChar(100), api || '')
    .input('DisplayName', sql.NVarChar(100), name)
    .input('SecretName', sql.NVarChar(200), secretName)
    .input('BaseUrl', sql.NVarChar(400), baseUrl)
    .query(`
      MERGE app.ApiConnections AS target
      USING (SELECT @Username AS Username, @Provider AS Provider, @ApiName AS ApiName) AS src
        ON  target.Username = src.Username
        AND target.Provider = src.Provider
        AND target.ApiName  = src.ApiName
      WHEN MATCHED THEN UPDATE SET
        DisplayName = @DisplayName, SecretName = @SecretName,
        BaseUrl = @BaseUrl, Enabled = 1, VerifiedAt = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT
        (Username, Provider, ApiName, DisplayName, SecretName, BaseUrl, Enabled, VerifiedAt)
        VALUES (@Username, @Provider, @ApiName, @DisplayName, @SecretName, @BaseUrl, 1, SYSUTCDATETIME())
      OUTPUT inserted.Id;
    `);

  return {
    stored: true,
    secretName,
    id: result.recordset && result.recordset[0] ? result.recordset[0].Id : null
  };
}

/* List one user's connections. Never returns keys — only secret names. */
async function listConnections(username) {
  const reason = storageUnavailable();
  if (reason) return { stored: false, reason, connections: [] };

  const sql = require('mssql');
  const pool = await sqlPool();
  const result = await pool.request()
    .input('Username', sql.NVarChar(100), username)
    .query(`
      SELECT Id, Provider, ApiName, DisplayName, SecretName, BaseUrl, Enabled, VerifiedAt, CreatedAt
      FROM app.ApiConnections
      WHERE Username = @Username
      ORDER BY CreatedAt DESC;
    `);

  return { stored: true, connections: result.recordset };
}

/* Remove the row, then the secret. Row first so the pipeline stops
   using it immediately even if the vault delete fails. */
async function deleteConnection(username, id) {
  const reason = storageUnavailable();
  if (reason) return { stored: false, reason };

  const sql = require('mssql');
  const pool = await sqlPool();
  const found = await pool.request()
    .input('Username', sql.NVarChar(100), username)
    .input('Id', sql.Int, Number(id))
    .query(`
      DELETE FROM app.ApiConnections
      OUTPUT deleted.SecretName
      WHERE Username = @Username AND Id = @Id;
    `);

  if (!found.recordset.length) return { stored: true, deleted: false };

  const { SecretName } = found.recordset[0];
  try {
    await vault().beginDeleteSecret(SecretName);
  } catch {
    // Row is gone, so the pipeline can't use it; the secret can be purged later.
  }
  return { stored: true, deleted: true, secretName: SecretName };
}

module.exports = {
  secretNameFor,
  storageUnavailable,
  saveConnection,
  listConnections,
  deleteConnection
};
