/* ============================================================
   APIQurate console — shared behaviour
   Demo auth, admin user management, per-user API connections.

   SECURITY NOTE: accounts and sessions here are FRONT-END ONLY,
   for prototyping while there is no backend. Passwords sit in
   localStorage and API keys too — fine for a local demo, never
   for production. Replace login/users/connections with calls to
   Azure Functions (/api/*) before going live.
   ============================================================ */

/* ---------- Accounts ----------
   The Admin account is built in and manages website users.
   Managed users live in localStorage under 'dh_users', seeded
   with TestUserSuman by default. */

const ADMIN_ACCOUNT = { username: 'Admin', password: 'AdminPassword', role: 'admin', name: 'Admin', initials: 'AD' };

const DEFAULT_USERS = [
  { username: 'TestUserSuman', password: 'TestUserSuman', role: 'user', name: 'TestUserSuman', initials: 'TS' }
];

const ADMIN_PAGES = ['users.html'];

/* Pages that only make sense once the user has that provider connected.
   Hidden from the sidebar and blocked on direct navigation. */
const PROVIDER_PAGES = {
  'xero-connections.html': 'Xero',
  'xero-mapping.html': 'Xero'
};

/* ---------- Providers ----------
   Base URLs are fixed per provider and live here (they mirror what the
   backend / Data Factory linked services use) — users never type them.
   Only 'Custom REST' asks for a URL. `keyPattern` is the offline
   fallback check used when /api/verify-connection isn't deployed yet. */

const PROVIDERS = {
  'HubSpot': {
    baseUrl: 'https://api.hubapi.com/',
    keyLabel: 'Private app token',
    keyHint: 'HubSpot private app tokens start with "pat-".',
    keyPattern: /^pat-[a-z0-9]+-[a-z0-9-]{16,}$/i
  },
  'Xero': {
    apis: [
      { label: 'Accounting (primary)', url: 'https://api.xero.com/api.xro/2.0/' },
      { label: 'Payroll (AU)',         url: 'https://api.xero.com/payroll.xro/1.0/' },
      { label: 'Payroll (UK/NZ)',      url: 'https://api.xero.com/payroll.xro/2.0/' },
      { label: 'Projects',             url: 'https://api.xero.com/projects.xro/2.0/' },
      { label: 'Assets',               url: 'https://api.xero.com/assets.xro/1.0/' },
      { label: 'Files',                url: 'https://api.xero.com/files.xro/1.0/' }
    ],
    keyLabel: 'OAuth 2.0 access token',
    keyHint: 'Paste the bearer token issued for your Xero tenant.',
    keyPattern: /^[A-Za-z0-9._~+/=-]{30,}$/
  },
  'PeopleHR': {
    baseUrl: 'https://api.peoplehr.net/v3.1',
    keyLabel: 'API key',
    keyHint: 'PeopleHR API keys are GUIDs, e.g. 1a2b3c4d-....',
    keyPattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  },
  'Custom REST': {
    custom: true,
    keyLabel: 'API key / token',
    keyHint: 'Enter the base URL and the token sent in the Authorization header.',
    keyPattern: /^\S{8,}$/
  }
};

/* Resolve the endpoint a connection should call, given the form state. */
function providerEndpoint(providerName, apiIndex, customUrl) {
  const meta = PROVIDERS[providerName];
  if (!meta) return '';
  if (meta.custom) return (customUrl || '').trim();
  if (meta.apis) return (meta.apis[apiIndex] || meta.apis[0]).url;
  return meta.baseUrl;
}

/* ---------- Navigation ----------
   userOnly items are the client-facing product; the Admin account
   only manages website users, so it doesn't see them. */

const NAV = [
  {
    id: 'overview',
    label: 'Overview',
    href: 'index.html',
    icon: '<path d="M3 12l9-9 9 9M5 10v10h14V10"/>'
  },
  {
    id: 'connections',
    label: 'Connections',
    href: 'sources.html',
    userOnly: true,
    icon: '<path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 0 1 0 10h-2M8 12h8"/>'
  },
  {
    id: 'xero',
    label: 'Xero Consolidation',
    userOnly: true,
    requiresProvider: 'Xero',
    icon: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    children: [
      { label: 'Connections', href: 'xero-connections.html' },
      { label: 'Mapping rules', href: 'xero-mapping.html' }
    ]
  },
  {
    id: 'ai',
    label: 'AI Connect',
    href: 'ai-connect.html',
    userOnly: true,
    icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"/>'
  },
  {
    id: 'de',
    label: 'Data Engineering',
    userOnly: true,
    icon: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
    children: [
      { label: 'Pipeline runs', href: 'runs.html' },
      { label: 'Datasets', href: 'datasets.html' }
    ]
  },
  {
    id: 'admin',
    label: 'User management',
    href: 'users.html',
    adminOnly: true,
    icon: '<path d="M12 2l8 4v6c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V6z"/>'
  }
];

/* ---------- Small helpers ---------- */

/* Escape a value before interpolating it into an HTML template string. */
function esc(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* localStorage throws in some privacy modes — never let that break the page. */
function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function readJson(key, fallback) {
  const raw = storageGet(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function currentFile() {
  const path = window.location.pathname.split('/').pop();
  return path === '' ? 'index.html' : path;
}

function fmtTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/* ---------- User store ---------- */

function getManagedUsers() {
  const list = readJson('dh_users', null);
  if (list) return list;
  storageSet('dh_users', JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS.slice();
}

function saveManagedUsers(list) {
  storageSet('dh_users', JSON.stringify(list));
}

function getAllUsers() {
  return [ADMIN_ACCOUNT, ...getManagedUsers()];
}

/* ---------- Session ---------- */

function currentUser() {
  const session = readJson('dh_session', null);
  if (!session) return null;
  return getAllUsers().find(u => u.username === session.username) || null;
}

function login(username, password) {
  const user = getAllUsers().find(u => u.username === username && u.password === password);
  if (!user) return false;
  storageSet('dh_session', JSON.stringify({ username: user.username, at: new Date().toISOString() }));
  logEvent(user, 'Sign-in', '—');
  return true;
}

function logout() {
  const user = currentUser();
  if (user) logEvent(user, 'Sign-out', '—');
  storageRemove('dh_session');
  window.location.href = 'login.html';
}

/* ---------- Per-user API connections ----------
   Keyed by username so each account only ever sees its own
   connections — the same segregation the backend will enforce. */

function connectionsKey(user) { return 'dh_conn_' + user.username; }

function getConnections(user) { return readJson(connectionsKey(user), []); }

function saveConnections(user, list) {
  storageSet(connectionsKey(user), JSON.stringify(list));
}

function maskSecret(secret) {
  const s = String(secret);
  return s.length <= 4 ? '••••' : '••••' + s.slice(-4);
}

/* ---------- Per-user audit trail ---------- */

function auditKey(username) { return 'dh_audit_' + username; }

function logEvent(user, event, target) {
  const list = readJson(auditKey(user.username), []);
  list.unshift({ time: new Date().toISOString(), actor: user.username, event, target });
  storageSet(auditKey(user.username), JSON.stringify(list.slice(0, 100)));
}

/* Admins see every account's events; users see their own. */
function getAuditEvents(user) {
  const names = user.role === 'admin' ? getAllUsers().map(u => u.username) : [user.username];
  return names
    .flatMap(n => readJson(auditKey(n), []))
    .sort((a, b) => (a.time < b.time ? 1 : -1));
}

/* ---------- Login page ---------- */

function wireLogin() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  const error = document.getElementById('loginError');

  form.addEventListener('submit', e => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    if (login(username, password)) {
      window.location.replace('index.html');
    } else if (error) {
      error.textContent = 'Wrong username or password.';
      error.classList.add('is-visible');
    }
  });
}

/* ---------- Shell: sidebar, user card, collapse ---------- */

/* True once the user has a verified connection for that provider. */
function hasProvider(connections, provider) {
  return (connections || []).some(c => c.provider === provider && c.verified);
}

function buildSidebar(user, connections) {
  const here = currentFile();
  const nav = document.getElementById('nav');
  if (!nav) return;

  const items = NAV.filter(item =>
    (!item.adminOnly || user.role === 'admin') &&
    (!item.userOnly || user.role !== 'admin') &&
    (!item.requiresProvider || hasProvider(connections, item.requiresProvider)));

  nav.innerHTML = items.map(item => {
    if (!item.children) {
      const active = item.href === here ? ' is-active' : '';
      return `
        <div class="nav__group">
          <a class="nav__link${active}" href="${esc(item.href)}">
            <svg class="nav__icon" viewBox="0 0 24 24">${item.icon}</svg>
            <span class="nav__label">${esc(item.label)}</span>
          </a>
        </div>`;
    }

    const hasActiveChild = item.children.some(c => c.href === here);
    const open = hasActiveChild ? ' is-open' : '';

    const subs = item.children.map(c => {
      const a = c.href === here ? ' is-active' : '';
      return `<a class="nav__sublink${a}" href="${esc(c.href)}">${esc(c.label)}</a>`;
    }).join('');

    return `
      <div class="nav__group">
        <button class="nav__trigger${open}" data-group="${esc(item.id)}" aria-expanded="${hasActiveChild}">
          <svg class="nav__icon" viewBox="0 0 24 24">${item.icon}</svg>
          <span class="nav__label">${esc(item.label)}</span>
          <svg class="nav__chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>
        </button>
        <div class="nav__sub${open}" data-sub="${esc(item.id)}">${subs}</div>
      </div>`;
  }).join('');

  nav.querySelectorAll('.nav__trigger').forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = nav.querySelector(`[data-sub="${btn.dataset.group}"]`);
      const open = btn.classList.toggle('is-open');
      sub.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });
}

function buildUserCard(user) {
  const slot = document.getElementById('whoami');
  if (!slot) return;
  slot.innerHTML = `
    <div class="who">
      <span class="who__badge">${esc(user.initials)}</span>
      <span class="who__meta">
        <span class="who__name">${esc(user.name)}</span>
        <span class="who__mail">${esc(user.role === 'admin' ? 'Administrator' : 'User')}</span>
      </span>
    </div>
    <button class="btn btn--sm who__out" id="logoutBtn">
      <svg viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
      Sign out
    </button>`;
  document.getElementById('logoutBtn').addEventListener('click', logout);
}

function wireCollapse() {
  const btn = document.getElementById('railToggle');
  const shell = document.getElementById('shell');
  if (!btn || !shell) return;

  if (storageGet('rail') === 'collapsed') {
    shell.classList.add('is-collapsed');
  }

  btn.addEventListener('click', () => {
    const collapsed = shell.classList.toggle('is-collapsed');
    storageSet('rail', collapsed ? 'collapsed' : 'open');
  });
}

/* ---------- Dropdown menus ---------- */

function wireMenus() {
  const closeAll = except => {
    document.querySelectorAll('.menu__panel.is-open').forEach(p => {
      if (p !== except) p.classList.remove('is-open');
    });
  };

  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-menu]');
    if (!trigger) { closeAll(); return; }

    e.preventDefault();
    const panel = document.getElementById(trigger.dataset.menu);
    closeAll(panel);
    if (!panel) return;

    // Panels are position:fixed so they float over scroll containers;
    // anchor to the trigger each time the panel opens.
    if (panel.classList.toggle('is-open')) {
      const r = trigger.getBoundingClientRect();
      panel.style.top = `${r.bottom + 4}px`;
      panel.style.left = `${r.left}px`;
    }
  });

  // A fixed panel would drift from its trigger on scroll or resize.
  window.addEventListener('scroll', () => closeAll(), true);
  window.addEventListener('resize', () => closeAll());

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAll();
  });
}

/* ---------- Tabs ---------- */

function wireTabs() {
  document.querySelectorAll('[role="tablist"]').forEach(list => {
    const scope = list.closest('[data-tabs]') || document;
    list.querySelectorAll('button').forEach(tab => {
      tab.addEventListener('click', () => {
        list.querySelectorAll('button').forEach(t => t.setAttribute('aria-selected', 'false'));
        tab.setAttribute('aria-selected', 'true');
        const target = tab.dataset.panel;
        scope.querySelectorAll('[data-tabpanel]').forEach(p => {
          p.hidden = p.dataset.tabpanel !== target;
        });
      });
    });
  });
}

/* ---------- Table filtering ---------- */

/* Filterable row text: every cell except the Actions menu, whose hidden
   items would otherwise match searches. */
function rowText(row) {
  return Array.from(row.cells)
    .filter(cell => !cell.querySelector('.menu'))
    .map(cell => cell.textContent)
    .join(' ')
    .toLowerCase();
}

function wireFilter() {
  const box = document.getElementById('filterText');
  const selects = Array.from(document.querySelectorAll('.filters select'));
  const reset = document.querySelector('.filters [data-reset]');
  if (!box && !selects.length) return;

  const apply = () => {
    const q = box ? box.value.trim().toLowerCase() : '';
    const terms = selects
      .map(s => s.value.trim().toLowerCase())
      .filter(v => v && !v.startsWith('all'));

    document.querySelectorAll('table.grid tbody tr').forEach(row => {
      const text = rowText(row);
      const show = (!q || text.includes(q)) && terms.every(t => text.includes(t));
      row.style.display = show ? '' : 'none';
    });
  };

  if (box) box.addEventListener('input', apply);
  selects.forEach(s => s.addEventListener('change', apply));
  if (reset) {
    reset.addEventListener('click', () => {
      if (box) box.value = '';
      selects.forEach(s => { s.selectedIndex = 0; });
      apply();
    });
  }
}

/* ---------- API connections page (sources.html) ---------- */

const CONNECTIONS_API = '/api/connections';

/* Shape a SQL row into the object the table renders. Keys never come
   back from the server — only the Key Vault secret name. */
function fromRow(row) {
  return {
    id: String(row.Id),
    provider: row.Provider,
    api: row.ApiName,
    name: row.DisplayName,
    baseUrl: row.BaseUrl,
    secretName: row.SecretName,
    verified: true,
    remote: true,
    addedAt: row.CreatedAt
  };
}

/* Connections from Azure SQL, or null when the backend isn't there or
   isn't configured for storage — in which case we use localStorage. */
async function fetchRemoteConnections(user) {
  try {
    const res = await fetch(`${CONNECTIONS_API}?username=${encodeURIComponent(user.username)}`,
      { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      apiFailure = describeApiFailure(res.status);
      return null;
    }
    apiFailure = null;
    const data = await res.json();
    if (!data.ok || !data.stored) {
      storageReason = data.reason || 'server storage not configured';
      return null;
    }
    storageReason = null;
    return (data.connections || []).map(fromRow);
  } catch (err) {
    apiFailure = `the API could not be reached (${err.message})`;
    return null;
  }
}

/* Why connections aren't being persisted server-side, when the API is up. */
let storageReason = null;

/* Distinguish "no API at all" from "API up, this function failed" by
   hitting the dependency-free probe. */
async function probeApi() {
  try {
    const res = await fetch('/api/ping', { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { deployed: false, status: res.status };
    return { deployed: true, info: await res.json() };
  } catch {
    return { deployed: false };
  }
}

/* One line telling the user exactly where their connections live. */
async function renderApiStatus() {
  const el = document.getElementById('connApiStatus');
  if (!el) return;

  if (apiFailure) {
    const probe = await probeApi();
    el.className = 'note note--bad';
    el.textContent = probe.deployed
      ? `Backend reachable but /api/connections failed — ${apiFailure}. Check the Function logs in the Azure portal.`
      : `Backend unavailable — ${apiFailure}. Connections are verified by key format only and saved in this browser.`;
    el.hidden = false;
    return;
  }

  if (storageReason) {
    /* The list endpoint only reports SQL; ask the probe what the vault is
       doing so the banner doesn't claim a working setting is missing. */
    const probe = await probeApi();
    const vaultReady = probe.deployed && probe.info && probe.info.vaultReady === 'ready';

    el.className = 'note note--warn';
    el.textContent = vaultReady
      ? `Keys are stored in Key Vault. Connections aren't registered for the pipeline yet — ${storageReason}. Run sql/schema.sql and set SQL_CONNECTION_STRING.`
      : `API is live and verifying credentials, but not storing them — ${storageReason}. Set KEY_VAULT_URI and SQL_CONNECTION_STRING to persist.`;
  } else {
    el.className = 'note note--ok';
    el.textContent = 'Backend live — credentials are tested against the provider and stored in Key Vault + Azure SQL.';
  }
  el.hidden = false;
}

/* The list to display: server-backed when available, else this browser. */
async function loadConnections(user) {
  const remote = await fetchRemoteConnections(user);
  return remote !== null ? remote : getConnections(user);
}

/* Why the backend couldn't be used, for the message shown to the user.
   Set by the fetch helpers below; null once a call succeeds. */
let apiFailure = null;

function describeApiFailure(status) {
  if (status === 404) return 'the /api endpoints are not deployed (set api_location: "api" in the workflow)';
  if (status === 500) return 'the API returned a server error (check the Function logs)';
  if (status === 501 || status === 405) return 'this server does not run the API (use: node dev-server.js)';
  return `the API returned ${status}`;
}

/* Verify and persist in one call. Falls back to verify-only plus local
   storage when /api/connections isn't deployed. */
async function submitConnection(user, conn) {
  try {
    const res = await fetch(CONNECTIONS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: user.username,
        provider: conn.provider,
        api: conn.api,
        name: conn.name,
        baseUrl: conn.baseUrl,
        key: conn.key
      })
    });
    if (res.ok) {
      apiFailure = null;
      const data = await res.json();
      if (!data.ok) return { ok: false, message: data.message };
      return {
        ok: true,
        verified: true,
        stored: !!data.stored,
        secretStored: !!data.secretStored,
        reason: data.reason,
        secretName: data.secretName
      };
    }
    /* Keep the server's own explanation — it is far more useful than a
       generic "not configured" fallback. */
    const detail = await res.json().catch(() => null);
    apiFailure = detail && detail.message
      ? `${describeApiFailure(res.status)} — ${detail.message}`
      : describeApiFailure(res.status);
  } catch (err) {
    apiFailure = `the API could not be reached (${err.message})`;
  }

  const verdict = await verifyConnection(conn);
  return { ok: verdict.ok, message: verdict.message, verified: verdict.verified, stored: false };
}

async function removeConnection(user, conn) {
  if (conn.remote) {
    const url = `${CONNECTIONS_API}?username=${encodeURIComponent(user.username)}&id=${encodeURIComponent(conn.id)}`;
    try {
      await fetch(url, { method: 'DELETE' });
    } catch { /* the list refresh below will show the truth */ }
  } else {
    saveConnections(user, getConnections(user).filter(c => c.id !== conn.id));
  }
  logEvent(user, 'Connection removed', `${conn.provider} · ${conn.name}`);
}

async function renderConnections(user) {
  const body = document.getElementById('connRows');
  const empty = document.getElementById('connEmpty');
  const wrap = document.getElementById('connTable');
  const count = document.getElementById('connCount');
  if (!body) return;

  const list = await loadConnections(user);
  await renderApiStatus();
  buildSidebar(user, list);
  if (count) count.textContent = `${list.length} connection${list.length === 1 ? '' : 's'}`;

  if (!list.length) {
    if (empty) empty.hidden = false;
    if (wrap) wrap.hidden = true;
    body.innerHTML = '';
    return;
  }

  if (empty) empty.hidden = true;
  if (wrap) wrap.hidden = false;

  body.innerHTML = list.map(c => {
    const status = c.verified
      ? '<span class="chip chip--good"><span class="chip__dot"></span>Verified</span>'
      : '<span class="chip chip--warn"><span class="chip__dot"></span>Unverified</span>';
    const secret = c.secretName
      ? `<span class="cell-mono">${esc(c.secretName)}</span>`
      : `<span class="cell-mono">${esc(maskSecret(c.key || ''))}</span> <span class="chip chip--warn">browser only</span>`;
    return `
    <tr>
      <td class="cell-strong">${esc(c.name)}</td>
      <td><span class="chip">${esc(c.provider)}${c.api ? ' · ' + esc(c.api) : ''}</span></td>
      <td class="cell-mono">${esc(c.baseUrl)}</td>
      <td>${secret}</td>
      <td>${status}</td>
      <td class="cell-mono">${esc(fmtTime(c.addedAt))}</td>
      <td><button class="btn btn--sm" data-remove="${esc(c.id)}">Remove</button></td>
    </tr>`;
  }).join('');

  body.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const conn = list.find(c => c.id === btn.dataset.remove);
      if (!conn) return;
      btn.disabled = true;
      await removeConnection(user, conn);
      await renderConnections(user);
    });
  });
}

/* Check the credentials before storing them.

   The browser cannot call HubSpot/Xero/PeopleHR directly — those APIs send
   no CORS headers, and the key must never be exposed to the page anyway.
   So the real check happens server-side. Until the Functions are deployed,
   fall back to the provider's key-format check and mark the connection
   Unverified so nothing claims to be validated when it wasn't. */
async function verifyConnection(conn) {
  try {
    const res = await fetch('/api/verify-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: conn.provider,
        baseUrl: conn.baseUrl,
        key: conn.key
      })
    });

    if (res.ok) {
      const data = await res.json();
      return data.ok
        ? { ok: true, verified: true }
        : { ok: false, message: data.message || 'The API rejected these credentials.' };
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: 'The API rejected these credentials (unauthorized).' };
    }
    // Any other status (typically 404) means the endpoint isn't deployed yet.
    apiFailure = describeApiFailure(res.status);
  } catch (err) {
    apiFailure = `the API could not be reached (${err.message})`;
  }

  const meta = PROVIDERS[conn.provider];
  if (meta.custom && !/^https?:\/\/.+/i.test(conn.baseUrl)) {
    return { ok: false, message: 'Enter a valid base URL starting with https://' };
  }
  if (meta.keyPattern && !meta.keyPattern.test(conn.key)) {
    return { ok: false, message: `That key doesn't look right. ${meta.keyHint}` };
  }
  return { ok: true, verified: false };
}

function wireConnections(user) {
  const form = document.getElementById('connForm');
  if (!form) return;

  const provider = document.getElementById('connProvider');
  const apiField = document.getElementById('connApiField');
  const apiSelect = document.getElementById('connApi');
  const urlField = document.getElementById('connUrlField');
  const urlInput = document.getElementById('connUrl');
  const keyInput = document.getElementById('connKey');
  const keyLabel = document.getElementById('connKeyLabel');
  const hint = document.getElementById('connHint');
  const error = document.getElementById('connError');
  const okBox = document.getElementById('connOk');
  const submit = document.getElementById('connSubmit');

  const names = Object.keys(PROVIDERS);
  if (!provider.options.length) {
    provider.innerHTML = names.map(p => `<option>${esc(p)}</option>`).join('');
  }

  const clearMessages = () => {
    error.classList.remove('is-visible');
    okBox.hidden = true;
  };

  /* Show only the fields this provider needs: a Base URL box for Custom REST,
     an API picker for Xero's several base URLs, neither for the rest. */
  const syncProviderFields = () => {
    const meta = PROVIDERS[provider.value];
    clearMessages();

    if (meta.apis) {
      apiField.hidden = false;
      if (apiSelect.dataset.for !== provider.value) {
        apiSelect.innerHTML = meta.apis
          .map((a, i) => `<option value="${i}">${esc(a.label)}</option>`).join('');
        apiSelect.dataset.for = provider.value;
      }
    } else {
      apiField.hidden = true;
    }

    urlField.hidden = !meta.custom;
    keyLabel.textContent = meta.keyLabel;

    const endpoint = providerEndpoint(provider.value, Number(apiSelect.value || 0), '');
    hint.textContent = meta.custom
      ? meta.keyHint
      : `Endpoint: ${endpoint} — set automatically. ${meta.keyHint}`;
  };

  provider.addEventListener('change', syncProviderFields);
  apiSelect.addEventListener('change', syncProviderFields);
  syncProviderFields();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearMessages();

    const meta = PROVIDERS[provider.value];
    const conn = {
      id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      provider: provider.value,
      api: meta.apis ? meta.apis[Number(apiSelect.value)].label : '',
      name: document.getElementById('connName').value.trim() || 'crm-db',
      baseUrl: providerEndpoint(provider.value, Number(apiSelect.value || 0), urlInput.value),
      key: keyInput.value.trim(),
      addedAt: new Date().toISOString()
    };

    if (!conn.key) {
      error.textContent = 'Enter the API key or token.';
      error.classList.add('is-visible');
      return;
    }

    submit.disabled = true;
    const label = submit.innerHTML;
    submit.textContent = 'Checking authorization…';

    const result = await submitConnection(user, conn);

    submit.disabled = false;
    submit.innerHTML = label;

    if (!result.ok) {
      error.textContent = result.message;
      error.classList.add('is-visible');
      return;
    }

    if (result.stored) {
      // The server owns this record now — nothing sensitive stays in the browser.
      okBox.textContent = `Verified and stored — key saved to Key Vault as "${result.secretName}" (with the Bearer prefix) and registered for the pipeline.`;
    } else if (result.secretStored) {
      /* Key is safe in the vault; the control-table row isn't there yet, so
         keep a local record — without the key — to list it. */
      conn.verified = true;
      conn.secretName = result.secretName;
      delete conn.key;
      const list = getConnections(user);
      list.push(conn);
      saveConnections(user, list);
      okBox.textContent = `Verified — key stored in Key Vault as "${result.secretName}" (with the Bearer prefix, ready for Data Factory). Not yet registered for the pipeline: ${result.reason}.`;
    } else {
      conn.verified = result.verified;
      const list = getConnections(user);
      list.push(conn);
      saveConnections(user, list);
      okBox.textContent = result.verified
        ? `Authorization confirmed — saved in this browser only (${result.reason || apiFailure || 'server storage not configured'}).`
        : `Added as Unverified — the key format is valid, but it was not tested: ${apiFailure || 'the backend is unavailable'}.`;
    }

    logEvent(user, 'Connection added', `${conn.provider} · ${conn.name}`);
    okBox.hidden = false;

    form.reset();
    syncProviderFields();
    okBox.hidden = false;
    await renderConnections(user);
  });

  renderConnections(user);
}

/* ---------- Overview page ---------- */

async function renderOverview(user) {
  const isAdmin = user.role === 'admin';

  const gsUser = document.getElementById('getStartedUser');
  const gsAdmin = document.getElementById('getStartedAdmin');
  if (gsUser) gsUser.hidden = isAdmin;
  if (gsAdmin) gsAdmin.hidden = !isAdmin;

  const tile = document.getElementById('tileSources');
  if (tile) {
    if (isAdmin) {
      tile.textContent = String(getManagedUsers().length);
      const label = document.getElementById('tileSourcesLabel');
      if (label) label.textContent = 'Website users';
      const foot = document.getElementById('tileSourcesFoot');
      if (foot) foot.textContent = 'Managed accounts';
    } else {
      const list = await loadConnections(user);
      tile.textContent = String(list.length);
      const foot = document.getElementById('tileSourcesFoot');
      if (foot) {
        foot.textContent = list.length
          ? [...new Set(list.map(c => c.provider))].join(' · ')
          : 'None connected yet';
      }
    }
  }

  const feed = document.getElementById('feedList');
  const feedEmpty = document.getElementById('feedEmpty');
  if (feed) {
    const events = getAuditEvents(user).slice(0, 6);
    if (!events.length) {
      feed.hidden = true;
      if (feedEmpty) feedEmpty.hidden = false;
    } else {
      feed.hidden = false;
      if (feedEmpty) feedEmpty.hidden = true;
      feed.innerHTML = events.map(ev => `
        <li>
          <span class="feed__mark feed__mark--good"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></span>
          <span class="feed__text">
            <span class="feed__title">${esc(ev.event)}${ev.target !== '—' ? ' — ' + esc(ev.target) : ''}</span>
            <span class="feed__sub">${esc(ev.actor)} · ${esc(fmtTime(ev.time))}</span>
          </span>
        </li>`).join('');
    }
  }
}

/* ---------- User management page (admin) ---------- */

function renderUserAdmin(admin) {
  const body = document.getElementById('usersRows');
  if (!body) return;

  const managed = getManagedUsers();
  const all = [ADMIN_ACCOUNT, ...managed];

  body.innerHTML = all.map(u => `
    <tr>
      <td class="cell-strong">${esc(u.username)}</td>
      <td class="cell-mono">
        <span data-pass="${esc(u.username)}">••••••••</span>
        <button class="btn btn--sm" data-show="${esc(u.username)}" style="margin-left:8px">Show</button>
      </td>
      <td><span class="chip${u.role === 'admin' ? ' chip--brand' : ''}">${esc(u.role === 'admin' ? 'Admin' : 'User')}</span></td>
      <td>${u.role === 'admin'
        ? '<span class="chip chip--dark">Built-in</span>'
        : `<button class="btn btn--sm" data-del="${esc(u.username)}">Remove</button>`}</td>
    </tr>`).join('');

  const count = document.getElementById('usersCount');
  if (count) count.textContent = `${all.length} accounts (1 admin, ${managed.length} user${managed.length === 1 ? '' : 's'})`;

  body.querySelectorAll('[data-show]').forEach(btn => {
    btn.addEventListener('click', () => {
      const u = all.find(x => x.username === btn.dataset.show);
      const span = body.querySelector(`[data-pass="${CSS.escape(btn.dataset.show)}"]`);
      if (!u || !span) return;
      const showing = btn.textContent === 'Hide';
      span.textContent = showing ? '••••••••' : u.password;
      btn.textContent = showing ? 'Show' : 'Hide';
    });
  });

  body.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.del;
      saveManagedUsers(getManagedUsers().filter(u => u.username !== name));
      storageRemove('dh_conn_' + name);
      storageRemove('dh_audit_' + name);
      logEvent(admin, 'User removed', name);
      renderUserAdmin(admin);
    });
  });
}

function wireUserAdmin(admin) {
  const form = document.getElementById('userForm');
  if (!form) return;
  const error = document.getElementById('userError');

  const fail = msg => {
    if (error) {
      error.textContent = msg;
      error.classList.add('is-visible');
    }
  };

  form.addEventListener('submit', e => {
    e.preventDefault();
    if (error) error.classList.remove('is-visible');

    const username = document.getElementById('newUser').value.trim();
    const password = document.getElementById('newPass').value;

    if (!username || !password) { fail('Username and password are both required.'); return; }
    if (getAllUsers().some(u => u.username.toLowerCase() === username.toLowerCase())) {
      fail(`"${username}" already exists.`);
      return;
    }

    const list = getManagedUsers();
    list.push({
      username,
      password,
      role: 'user',
      name: username,
      initials: username.slice(0, 2).toUpperCase()
    });
    saveManagedUsers(list);
    logEvent(admin, 'User added', username);
    form.reset();
    renderUserAdmin(admin);
  });

  renderUserAdmin(admin);
}

/* ---------- Boot ---------- */

document.addEventListener('DOMContentLoaded', async () => {
  const onLoginPage = currentFile() === 'login.html';
  const user = currentUser();

  if (onLoginPage) {
    if (user) { window.location.replace('index.html'); return; }
    wireLogin();
    return;
  }

  if (!user) { window.location.replace('login.html'); return; }

  const here = currentFile();

  if (user.role !== 'admin' && ADMIN_PAGES.includes(here)) {
    window.location.replace('index.html');
    return;
  }

  /* The admin has no connections of their own, so skip the lookup. */
  const connections = user.role === 'admin' ? [] : await loadConnections(user);

  /* A page tied to a provider is unreachable without that connection. */
  const needed = PROVIDER_PAGES[here];
  if (needed && !hasProvider(connections, needed)) {
    window.location.replace('sources.html');
    return;
  }

  buildSidebar(user, connections);
  buildUserCard(user);
  wireCollapse();
  wireMenus();
  wireTabs();

  renderOverview(user);
  wireConnections(user);
  if (user.role === 'admin') wireUserAdmin(user);

  wireFilter();
});
