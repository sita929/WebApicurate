# APIQurate console — frontend

Admin console for connecting client APIs and feeding them into Azure SQL via
Data Factory. The front end is plain HTML, CSS and JavaScript — no build step,
no framework, no dependencies.

## Running it

```bash
node dev-server.js
```

Then open http://localhost:8123/login.html. `dev-server.js` serves the static
files **and** the `/api` routes, mirroring what Azure Static Web Apps does in
production — so credential verification works locally exactly as it will once
deployed. (A plain static server like `python -m http.server` also serves the
pages, but `/api/*` won't answer and connections can't be verified.)

## Accounts (demo only)

Login is **front-end only** while there is no backend — the accounts live in
`js/app.js` and the session in `localStorage`. This is fine for prototyping and
useless as real security: anyone can read the passwords in the source.

| Username | Password | Role |
|---|---|---|
| `Admin` | `AdminPassword` | Admin — manages website users only (usernames and passwords) |
| `TestUserSuman` | `TestUserSuman` | Default user (seeded) — connects APIs, sees only their own data |

The Admin account is built in and exists only to manage website users — it does
not see the client-facing pages (Connections, Xero, Data Engineering).
Users the admin creates are stored in localStorage under `dh_users`;
`TestUserSuman` is seeded by default. The login form is pre-filled with the
default user for quick demos.

Replace this with real authentication (e.g. Azure Static Web Apps built-in auth or
Entra ID) before anything real touches the site.

## API connections

Each signed-in user registers their own APIs (HubSpot, Xero, PeopleHR, custom
REST) on the **Connections** page. Every connection is verified against the
provider, then the key goes to Key Vault and a row to Azure SQL, keyed by
username — the segregation the pipeline relies on.

When Key Vault / SQL aren't configured, connections fall back to the
localStorage key `dh_conn_<username>` and are labelled **browser only**. Audit
events are still local (`dh_audit_<username>`).

## Pages

| File | Purpose |
|---|---|
| `login.html` | Sign in |
| `index.html` | Overview — stat tiles, get-started card, activity feed |
| `sources.html` | Connections — add/remove per-user API credentials |
| `runs.html` | Pipeline run history (empty until the pipeline exists) |
| `datasets.html` | Warehouse tables (empty until first load) |
| `xero-connections.html` | Xero organisations (hidden until Xero is connected) |
| `xero-mapping.html` | Account mapping rules (hidden until Xero is connected) |
| `ai-connect.html` | Natural-language query panel (empty until data exists) |
| `users.html` | Admin — user management (add/remove users, view usernames and passwords) |

## Structure

```
css/app.css              all styling, design tokens at the top
js/app.js                sidebar, nav state, auth, connections UI
img/                     logo assets
*.html                   one file per page
api/verify.js            per-provider credential probes
api/store.js             Key Vault + Azure SQL persistence
api/ping/                Function: deployment probe (no deps)
api/verify-connection/   Function: test credentials only
api/connections/         Function: verify, then store; list; delete
sql/schema.sql           app.ApiConnections control table
dev-server.js            local static + /api server
staticwebapp.config.json SWA runtime + routing
```

The sidebar is generated from the `NAV` array in `js/app.js`. Add a page by adding
an entry there and creating the HTML file — active state and expansion are worked
out from the filename automatically.

## Wiring to a real API

Every table currently holds static rows. To make one live, replace the `<tbody>`
contents with a fetch. **Always escape API data before putting it in `innerHTML`** —
a user-controlled name like `<img src=x onerror=...>` would otherwise execute in
every admin's browser. `js/app.js` exports an `esc()` helper for exactly this:

```js
async function loadUsers() {
  const res  = await fetch('/api/users');
  const rows = await res.json();
  document.querySelector('#usersTable tbody').innerHTML = rows.map(u => `
    <tr>
      <td class="cell-strong">${esc(u.name)}</td>
      <td class="cell-mono">${esc(u.email)}</td>
      <td><span class="chip">${esc(u.role)}</span></td>
    </tr>`).join('');
}
```

On Azure Static Web Apps, put those endpoints in an `api/` folder at the repo root —
they deploy as managed Functions and are reachable at `/api/*` with no CORS setup.

The front-end auth/connection functions in `js/app.js` map 1:1 to the endpoints
you will need:

| Front-end function | Backend endpoint | State |
|---|---|---|
| `verifyConnection()` | `POST /api/verify-connection` | **Built** — see below |
| `login()` / `logout()` | `POST /api/login`, `POST /api/logout` (or SWA built-in auth) | To build |
| `getManagedUsers()` / `saveManagedUsers()` | `GET/POST/DELETE /api/users` (admin only) | To build |
| `submitConnection()` / `loadConnections()` | `GET/POST/DELETE /api/connections` | **Built** — see below |
| `logEvent()` / `getAuditEvents()` | `POST /api/audit`, `GET /api/audit` | To build |

## Provider base URLs

Users never type a base URL — it is fixed per provider in `PROVIDERS`
(`js/app.js`) and mirrors what the Data Factory linked services use:

| Provider | Base URL |
|---|---|
| HubSpot | `https://api.hubapi.com/` |
| Xero — Accounting (primary) | `https://api.xero.com/api.xro/2.0/` |
| Xero — Payroll (AU) | `https://api.xero.com/payroll.xro/1.0/` |
| Xero — Payroll (UK/NZ) | `https://api.xero.com/payroll.xro/2.0/` |
| Xero — Projects | `https://api.xero.com/projects.xro/2.0/` |
| Xero — Assets | `https://api.xero.com/assets.xro/1.0/` |
| Xero — Files | `https://api.xero.com/files.xro/1.0/` |
| PeopleHR | `https://api.peoplehr.net/v3.1` |
| Custom REST | user-supplied (the only case where the field is shown) |

Xero shows an extra **API** picker because it has several base URLs.

### Provider-gated navigation

The **Xero Consolidation** group is hidden until the user has a *verified* Xero
connection, and its pages redirect to Connections if opened directly. The nav
updates the moment a Xero connection is added or removed — no reload. Gate any
future section the same way: add `requiresProvider: '<Provider>'` to its `NAV`
entry and list its pages in `PROVIDER_PAGES` (`js/app.js`).

## Verifying credentials (implemented)

Credentials are tested against the real provider before a connection is saved.
The browser can't do this itself — these APIs send no CORS headers, and the key
should never be handled by page code — so the form posts to
**`POST /api/verify-connection`**, which makes the authenticated call
server-side and answers `{ ok: true }` or `{ ok: false, message }`.

- `ok: true` → connection saved with status **Verified**
- `ok: false` → connection is **rejected**, showing the provider's own reason
- endpoint unreachable → falls back to a key-format check and saves as
  **Unverified**, so nothing ever claims a check that didn't happen

| File | Role |
|---|---|
| `api/verify.js` | The probes — one read-only call per provider |
| `api/verify-connection/` | Azure Function wrapper (SWA managed function) |
| `api/ping/` | Dependency-free deployment probe |
| `dev-server.js` | Local server: static files + the same `/api` handler |

The probe per provider:

| Provider | Probe | Passes when |
|---|---|---|
| HubSpot | `GET /crm/v3/objects/contacts?limit=1` with `Bearer` | 200; 401 = bad token, 403 = missing scope |
| Xero | `GET https://api.xero.com/connections` with `Bearer` | 200 with ≥1 tenant (no tenant id needed) |
| PeopleHR | `POST /Employee` with `{APIKey, Action}` | 200 and `isError: false` |
| Custom REST | `GET <base URL>` with `Bearer` | any 2xx |

The key is used for the probe only — never logged, echoed back, or stored by
the Function. Calls time out after 10 seconds. If a user pastes `Bearer <token>`
the scheme is stripped before probing, so it verifies either way.

#### What gets stored in Key Vault

Data Factory's REST linked service sends the secret value **verbatim** as the
`Authorization` header, so the secret must carry the scheme:

| Provider | Secret value |
|---|---|
| HubSpot | `Bearer pat-na2-…` |
| Xero | `Bearer <access token>` |
| Custom REST | `Bearer <token>` |
| PeopleHR | the raw key — it authenticates with `APIKey` in the body, not a header |

So the ADF linked service needs no `@concat('Bearer ', ...)`; it references the
secret directly (see the pipeline section below).

On success the request continues into storage — see the next section.

## Storing a connection (implemented)

`POST /api/connections` verifies the credentials and then persists them:

1. **Key Vault** — the key is written as a secret named `<provider>--<username>`
   (e.g. `hubspot--TestUserSuman`), tagged with provider and username.
2. **Azure SQL** — a row is upserted into `app.ApiConnections` holding the
   *secret name*, never the key itself.

The key exists in the Function for the probe and the vault write, then is
discarded: it is never written to SQL, never logged, and never returned to the
browser. `GET /api/connections` lists a user's rows (secret names only) and
`DELETE /api/connections?id=` removes the row first, then the secret.

Identity comes from the Static Web Apps `x-ms-client-principal` header when
auth is configured, which **overrides** any username in the request — so one
user cannot read another's connections. Until auth is switched on, the
username in the request body is trusted, which is fine for a demo and not for
production.

If `KEY_VAULT_URI` / `SQL_CONNECTION_STRING` are unset, connections still
verify but are saved in the browser and flagged **browser only** — the app
degrades honestly rather than pretending it stored something.

### Configuration

Key Vault and SQL are configured **independently**. Setting only
`KEY_VAULT_URI` already writes each key to the vault; the SQL control table
can follow later. The three states:

| Settings present | Behaviour |
|---|---|
| neither | verified only, connection kept in the browser |
| `KEY_VAULT_URI` | key written to the vault; connection listed from the browser |
| both | key in the vault **and** a row the pipeline reads — fully server-owned |

#### Key Vault access

SWA *managed* functions cannot use a managed identity, so
`DefaultAzureCredential` needs a service principal supplied as app settings.

Azure Cloud Shell defaults to **PowerShell**, where `VAR=$(...)` is not valid —
use `$VAR = ...`. PowerShell:

```powershell
$vaultId = az keyvault show --name sumanpockeyvault --query id -o tsv

# 1. Create the service principal (prints appId / password / tenant)
az ad sp create-for-rbac --name apiqurate-swa

# 2. Grant it secret read/write on the vault only
az role assignment create --assignee <appId> `
  --role "Key Vault Secrets Officer" --scope $vaultId
```

Bash equivalent:

```bash
VAULT_ID=$(az keyvault show --name sumanpockeyvault --query id -o tsv)
az ad sp create-for-rbac --name apiqurate-swa
az role assignment create --assignee <appId>   --role "Key Vault Secrets Officer" --scope "$VAULT_ID"
```

Always pass an explicit `--scope`. If it is empty the assignment is attempted
at scope `''`, which either fails or lands far wider than intended — check what
actually exists with:

```powershell
az role assignment list --assignee <appId> --all -o table
```

If the vault uses **access policies** rather than RBAC — check with
`az keyvault show --name sumanpockeyvault --query properties.enableRbacAuthorization` —
grant access this way instead (note: no angle brackets, PowerShell treats `<`
as an operator):

```powershell
az keyvault set-policy --name sumanpockeyvault --spn <appId> `
  --secret-permissions get set list delete
```

Treat the printed `password` as a live credential: never paste it into chat,
source control, or a ticket. If one leaks, rotate it with
`az ad app credential reset --id <appId>`.

#### App settings

Static Web App → Configuration → Application settings:

| Setting | Value |
|---|---|
| `KEY_VAULT_URI` | `https://sumanpockeyvault.vault.azure.net/` |
| `AZURE_TENANT_ID` | `tenant` from the command above |
| `AZURE_CLIENT_ID` | `appId` |
| `AZURE_CLIENT_SECRET` | `password` |
| `SQL_CONNECTION_STRING` | *(optional at this stage)* `Server=tcp:<srv>.database.windows.net,1433;Database=<db>;User Id=...;Password=...;Encrypt=true` |

Or from the CLI. The `--name` is the **resource name**, not the hostname
prefix (`proud-meadow-05a99be0f` is a hostname; the resource is usually named
after the repo) — look it up first:

```powershell
az staticwebapp list --query "[].{name:name, rg:resourceGroup, host:defaultHostname}" -o table

az staticwebapp appsettings set --name <resource-name> --setting-names `
  KEY_VAULT_URI="https://sumanpockeyvault.vault.azure.net/" `
  AZURE_TENANT_ID="<tenant>" AZURE_CLIENT_ID="<appId>" AZURE_CLIENT_SECRET="<password>"
```

Substitute real values — a quoted `"<password>"` is stored literally and shows
up later as a confusing 401 from Key Vault.

Confirm with `/api/ping` — it reports `keyVaultConfigured` and `sqlConfigured`.
Secrets appear in the vault as `hubspot--<username>`, `xero--<username>`, and so on.

If you later switch to a linked Function App instead of managed functions,
drop the three `AZURE_*` settings and assign it a managed identity —
`DefaultAzureCredential` picks up either.

#### SQL control table

Until this is done, keys are stored in Key Vault but the pipeline has no rows
to read. Create the table once — Cloud Shell already has `sqlcmd`, and `-G`
uses your Azure AD login:

```bash
sqlcmd -S <server>.database.windows.net -d <db> -G -i sql/schema.sql
```

Then add the connection string as an app setting. SQL authentication (a
contained user with `db_datareader`/`db_datawriter`) keeps the Functions
independent of your personal login:

```powershell
az staticwebapp appsettings set --name APIQurateTest --resource-group Suman `
  --setting-names SQL_CONNECTION_STRING="Server=tcp:<srv>.database.windows.net,1433;Database=<db>;User Id=<user>;Password=<pw>;Encrypt=true;TrustServerCertificate=false"
```

Make sure the SQL server firewall has **Allow Azure services** enabled, or the
Functions can't reach it.

## Per-user pipeline design (HubSpot via ADF)

One parameterised pipeline serves every user — never clone pipelines per client.

1. **Lookup** reads the control table:
   `SELECT Username, Provider, ApiName, SecretName, BaseUrl FROM app.vw_ActiveConnections`
2. **ForEach** over `@activity('Lookup').output.value`
3. **Copy** inside the loop, with the REST linked service parameterised:

```json
{
  "type": "RestService",
  "parameters": { "baseUrl": {"type": "String"}, "secretName": {"type": "String"} },
  "typeProperties": {
    "url": "@{linkedService().baseUrl}",
    "authenticationType": "Anonymous",
    "authHeaders": {
      "Authorization": {
        "type": "AzureKeyVaultSecret",
        "store": { "referenceName": "YourKeyVaultLS", "type": "LinkedServiceReference" },
        "secretName": "@{linkedService().secretName}"
      }
    }
  }
}
```

Each iteration passes `@item().SecretName` and `@item().BaseUrl` through the
dataset, so every call uses that user's own key. Add an **Additional column**
`Username = @item().Username` in the Copy source so landing tables stay
segregated per user (and stage raw files under `raw/hubspot/@{item().Username}/`).

Onboarding a client is then: they add a connection on the site → secret and row
appear → the next scheduled run picks them up. No ADF changes.

## Deploying to Azure Static Web Apps

1. Push this folder to a GitHub repo
2. Azure portal → Create resource → Static Web App
3. Plan type: **Free**
4. Build presets: **Custom**
5. App location: `/`
6. Api location: `api` — **required**, or the Functions never deploy
7. Output location: `/`

Azure writes a GitHub Actions workflow into the repo and deploys on every push to
the chosen branch.

### Diagnosing "Added as Unverified"

The Connections page shows a status line saying exactly where connections are
going:

| Banner | Meaning |
|---|---|
| green — *Backend live* | credentials tested against the provider, stored in Key Vault + SQL |
| amber — *live but not storing* | API works; `KEY_VAULT_URI` / `SQL_CONNECTION_STRING` not set |
| red — *Backend unavailable* | `/api/*` isn't answering; the reason is named in the banner |

"Added as Unverified" always means the red case: neither `/api/connections`
nor `/api/verify-connection` responded, so only the key *format* was checked.

**`GET /api/ping` is the deployment probe.** It has no dependencies and reads
no config, so it answers even when Key Vault, SQL or `npm install` are broken:

```bash
curl -i https://<your-site>.azurestaticapps.net/api/ping
```

| Result | Meaning | Fix |
|---|---|---|
| `404` | the Functions were never deployed | set `api_location: "api"` in the workflow |
| `{"ok":true,...}` | API is live | read `keyVaultConfigured` / `sqlConfigured` in the response |
| `500` | deployed but crashing | check Function logs in the portal |

Open it in a browser too — it is a plain GET. Locally the same 404/501 symptom
means the site is being served by something other than `node dev-server.js`
(Python's `http.server` answers POST with `501`).

### The workflow file

Azure's generated workflow needs `api_location` set, or the Functions never
deploy and every connection falls back to *browser only*:

```yaml
          app_location: "/"
          api_location: "api"      # <- must not be empty
          output_location: "."
```

The root `package.json` exists only to satisfy Oryx: `dev-server.js` at the
repo root makes it detect a Node app, and it then fails the build looking for a
`build` script. The script is a deliberate no-op — there is nothing to bundle.
(Setting `skip_app_build: true` in the workflow is an equivalent fix.)

The `Unexpected input(s) 'github_id_token'` warning is harmless — a newer
workflow template against an older action version.

### If the Static Web App already exists

The workflow was generated with whatever Api location was set at creation. If it
was left blank, `api/` is **not deployed**, `/api/verify-connection` returns 404,
and every connection saves as *Unverified*. Fix it in
`.github/workflows/azure-static-web-apps-*.yml`:

```yaml
          app_location: "/"
          api_location: "api"      # <- must not be empty
          output_location: "/"
```

`staticwebapp.config.json` pins the Functions runtime to `node:20`, which the
probes need for global `fetch`. Don't drop below Node 18.

### Checking it works after deploy

```bash
curl -X POST https://<your-site>.azurestaticapps.net/api/verify-connection \
  -H "Content-Type: application/json" \
  -d '{"provider":"HubSpot","baseUrl":"https://api.hubapi.com/","key":"pat-na1-bad"}'
```

A JSON body back (`{"ok":false,...}`) means the API is live. A 404 means
`api_location` is still wrong.

## Notes

- Sidebar collapse state persists in `localStorage`
- The search box on each list page filters visible table rows client-side
- Responsive down to mobile; sidebar auto-collapses below 860px
- Keyboard focus is visible throughout; `prefers-reduced-motion` is respected
