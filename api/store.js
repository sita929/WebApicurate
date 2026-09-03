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

const { secretValueFor } = require('./verify');

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

function tryRequire(name) {
  try { return require(name); } catch { return null; }
}

function missingModule(names) {
  for (const mod of names) {
    if (!tryRequire(mod)) return `dependency "${mod}" is not installed (run npm install in api/)`;
  }
  return null;
}

/* Key Vault and SQL are checked independently: storing the key in the vault
   is useful on its own, before the control table exists. Each returns null
   when ready, or a human-readable reason it isn't. */

function vaultUnavailable() {
  if (!KEY_VAULT_URI) return 'KEY_VAULT_URI is not set';
  return missingModule(['@azure/identity', '@azure/keyvault-secrets']);
}

function sqlUnavailable() {
  if (!SQL_CONNECTION_STRING) return 'SQL_CONNECTION_STRING is not set';
  return missingModule(['mssql']);
}

/* Ready only when both halves work — used for the "fully stored" state. */
function storageUnavailable() {
  const reasons = [vaultUnavailable(), sqlUnavailable()].filter(Boolean);
  return reasons.length ? reasons.join('; ') : null;
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

/* Azure SDK errors are verbose; pull out the part that says what to fix. */
function describeAzureError(err) {
  const msg = String(err && err.message || err);
  if (/Forbidden|403/.test(msg)) {
    return 'access denied (403) — the service principal lacks Key Vault Secrets Officer, or the vault uses access policies';
  }
  if (/401|invalid_client|AADSTS/.test(msg)) {
    return 'authentication failed — check AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID';
  }
  if (/ENOTFOUND|getaddrinfo|ETIMEDOUT/.test(msg)) {
    return 'could not reach the resource — check the URI / connection string';
  }
  return msg.slice(0, 200);
}

/* Store the key in Key Vault, then upsert the control-table row.

   The two halves are independent: with only the vault configured the secret
   is still written (and the caller keeps the record client-side), so the
   vault can be set up before the SQL control table exists. Key Vault goes
   first — a stranded secret is harmless, a SQL row pointing at a secret that
   doesn't exist would break the pipeline. */
async function saveConnection({ username, provider, api, name, baseUrl, key }) {
  const secretName = secretNameFor(provider, username);
  const result = {
    secret: { stored: false, name: secretName, reason: vaultUnavailable() },
    row: { stored: false, id: null, reason: sqlUnavailable() }
  };

  if (!result.secret.reason) {
    /* Stored with the auth scheme included, because Data Factory sends the
       secret value straight into the Authorization header. */
    const value = secretValueFor(provider, key);
    const tags = { provider, username, app: 'apiqurate' };

    try {
      await vault().setSecret(secretName, value, { tags });
      result.secret.stored = true;
    } catch (err) {
      /* A previously removed connection leaves the secret soft-deleted, and
         Key Vault refuses to reuse the name until it is recovered. */
      if (/deleted but recoverable|ObjectIsDeletedButRecoverable|Conflict/i.test(String(err && err.message))) {
        try {
          const poller = await vault().beginRecoverDeletedSecret(secretName);
          await poller.pollUntilDone();
          await vault().setSecret(secretName, value, { tags });
          result.secret.stored = true;
        } catch (recoverErr) {
          result.secret.reason = `Key Vault write failed after recovery attempt: ${describeAzureError(recoverErr)}`;
        }
      } else {
        result.secret.reason = `Key Vault write failed: ${describeAzureError(err)}`;
      }
    }
  }

  if (!result.row.reason) {
    /* Without the secret in the vault the pipeline has nothing to resolve,
       so don't advertise a connection it can't actually run. */
    if (!result.secret.stored) {
      result.row.reason = 'skipped — the key was not stored in Key Vault';
    } else {
      try {
      const sql = require('mssql');
      const pool = await sqlPool();
      const inserted = await pool.request()
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
      result.row.stored = true;
      result.row.id = inserted.recordset && inserted.recordset[0] ? inserted.recordset[0].Id : null;
      } catch (err) {
        result.row.reason = `SQL write failed: ${describeAzureError(err)}`;
      }
    }
  }

  /* `stored` means fully server-owned: secret in the vault AND a row the
     pipeline will pick up. Anything less and the caller keeps its own copy. */
  return {
    stored: result.secret.stored && result.row.stored,
    secretStored: result.secret.stored,
    secretName: result.secret.stored ? secretName : null,
    rowStored: result.row.stored,
    id: result.row.id,
    reason: [result.secret.reason, result.row.reason].filter(Boolean).join('; ') || undefined
  };
}

/* List one user's connections. Never returns keys — only secret names. */
async function listConnections(username) {
  const reason = sqlUnavailable();
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

/* Soft-delete the secret. Key Vault keeps it recoverable, which is why
   saveConnection knows how to recover one when a connection is re-added. */
async function removeSecret(secretName) {
  const reason = vaultUnavailable();
  if (reason) return { deleted: false, reason };

  try {
    await vault().beginDeleteSecret(secretName);
    return { deleted: true };
  } catch (err) {
    if (/SecretNotFound|not found|404/i.test(String(err && err.message))) {
      return { deleted: false, reason: 'the secret was already gone' };
    }
    return { deleted: false, reason: describeAzureError(err) };
  }
}

/* Remove a connection and, when nothing else needs it, its Key Vault secret.

   Two modes:
   - `id`       the SQL row to drop (the secret follows if unused elsewhere)
   - `provider` vault-only mode, where the caller keeps the list; it passes
                `secretInUse` to say whether another of its connections
                still relies on the same secret.

   Xero's several APIs share one token — and therefore one secret — so the
   secret is only removed when the last connection using it goes. */
async function deleteConnection(username, { id, provider, secretInUse } = {}) {
  const sqlReason = sqlUnavailable();
  const result = { rowDeleted: false, secretDeleted: false, secretName: null };
  let stillUsed = Boolean(secretInUse);

  if (!sqlReason && id) {
    const sql = require('mssql');
    const pool = await sqlPool();

    const dropped = await pool.request()
      .input('Username', sql.NVarChar(100), username)
      .input('Id', sql.Int, Number(id))
      .query(`
        DELETE FROM app.ApiConnections
        OUTPUT deleted.SecretName
        WHERE Username = @Username AND Id = @Id;
      `);

    if (!dropped.recordset.length) {
      return { ...result, notFound: true };
    }

    result.rowDeleted = true;
    result.secretName = dropped.recordset[0].SecretName;

    /* Another API for the same provider may still point at this secret. */
    const remaining = await pool.request()
      .input('Username', sql.NVarChar(100), username)
      .input('SecretName', sql.NVarChar(200), result.secretName)
      .query(`
        SELECT COUNT(*) AS InUse FROM app.ApiConnections
        WHERE Username = @Username AND SecretName = @SecretName;
      `);
    stillUsed = remaining.recordset[0].InUse > 0;

  } else if (provider) {
    /* No row to drop in this mode — the caller keeps the list. */
    result.secretName = secretNameFor(provider, username);
  } else {
    return { ...result, reason: sqlReason || 'id or provider is required' };
  }

  if (stillUsed) {
    result.secretReason = 'kept — another connection still uses this secret';
    return result;
  }

  const removed = await removeSecret(result.secretName);
  result.secretDeleted = removed.deleted;
  if (removed.reason) result.secretReason = removed.reason;
  return result;
}

module.exports = {
  secretNameFor,
  storageUnavailable,
  vaultUnavailable,
  sqlUnavailable,
  saveConnection,
  listConnections,
  deleteConnection
};
