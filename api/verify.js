/* ============================================================
   Credential verification — shared by the Azure Function and the
   local dev server.

   Each provider gets a cheap, read-only probe call. A 2xx means the
   token really works; 401/403 means it doesn't. The key is used here
   and never logged, echoed back, or persisted by this module.
   ============================================================ */

const TIMEOUT_MS = 10000;

function ok() {
  return { ok: true };
}

function fail(message) {
  return { ok: false, message };
}

async function request(url, options) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/* Join a base URL and a path without doubling or dropping slashes. */
function join(baseUrl, path) {
  return baseUrl.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

const PROBES = {
  async HubSpot(baseUrl, key) {
    const res = await request(join(baseUrl, 'crm/v3/objects/contacts?limit=1'), {
      headers: { Authorization: `Bearer ${key}` }
    });
    if (res.ok) return ok();
    if (res.status === 401) return fail('HubSpot rejected this token (401 Unauthorized). Check the private app token.');
    if (res.status === 403) return fail('Token is valid but lacks the crm.objects.contacts.read scope. Add it to the private app.');
    return fail(`HubSpot returned ${res.status}.`);
  },

  /* /connections needs only the bearer token and lists the tenants it
     can reach, so it validates the token without a tenant id. */
  async Xero(baseUrl, key) {
    const res = await request('https://api.xero.com/connections', {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }
    });
    if (res.ok) {
      const tenants = await res.json().catch(() => []);
      if (Array.isArray(tenants) && tenants.length === 0) {
        return fail('Token is valid but no Xero organisation is connected to it.');
      }
      return ok();
    }
    if (res.status === 401) return fail('Xero rejected this token (401). Access tokens expire after 30 minutes — get a fresh one.');
    return fail(`Xero returned ${res.status}.`);
  },

  async PeopleHR(baseUrl, key) {
    const res = await request(join(baseUrl, 'Employee'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ APIKey: key, Action: 'GetAllEmployeeDetail' })
    });
    if (!res.ok) return fail(`PeopleHR returned ${res.status}.`);
    const data = await res.json().catch(() => null);
    if (data && data.isError) {
      return fail(data.Message || 'PeopleHR rejected this API key.');
    }
    return ok();
  },

  async 'Custom REST'(baseUrl, key) {
    const res = await request(baseUrl, {
      headers: { Authorization: `Bearer ${key}` }
    });
    if (res.ok) return ok();
    if (res.status === 401 || res.status === 403) {
      return fail(`The endpoint rejected this token (${res.status}).`);
    }
    return fail(`The endpoint returned ${res.status}.`);
  }
};

async function verifyCredentials({ provider, baseUrl, key }) {
  if (!provider || !key) return fail('Provider and key are required.');

  const probe = PROBES[provider];
  if (!probe) return fail(`Unknown provider "${provider}".`);

  if (provider === 'Custom REST' && !/^https?:\/\/.+/i.test(baseUrl || '')) {
    return fail('A valid base URL is required.');
  }

  try {
    return await probe(baseUrl, key);
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return fail('The provider did not respond within 10 seconds.');
    }
    return fail(`Could not reach the provider: ${err.message}`);
  }
}

module.exports = { verifyCredentials };
