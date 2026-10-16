const fs = require('fs');

const HOST = 'api-basketball-nba.p.rapidapi.com';

/** Minimal .env loader so the bot needs no dependencies. */
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

/** GET a Basketball API v2 route. Throws with the API's error message on failure. */
async function api(route, params = {}) {
  const url = new URL(`https://${HOST}${route}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url, { headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': process.env.RAPIDAPI_KEY } });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    const err = new Error(`${route}: ${body?.error?.message || body?.message || 'HTTP ' + res.status}`);
    err.status = res.status;
    throw err;
  }
  return body; // { data, meta }
}

/** YYYYMMDD in US Eastern time – the NBA's game day. */
function todayET(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}`;
}

module.exports = { loadEnv, api, todayET };
