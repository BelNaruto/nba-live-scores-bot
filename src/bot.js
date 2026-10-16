#!/usr/bin/env node
/**
 * NBA Live Scores Bot – Discord & Telegram
 *
 * Posts to your Discord channel and/or Telegram chat:
 *   • a daily preview of today's games with win probabilities and projected scores
 *   • live score updates at the end of every quarter
 *   • final scores with the top scorer of each team
 *
 * Works for NBA, WNBA, G League and NCAA. Zero dependencies, Node.js 18+.
 *
 * API:     https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/api-basketball-nba
 * Support: Telegram @pintoflow
 *
 *   node src/bot.js             live mode: daily preview + quarter updates + finals (runs forever)
 *   node src/bot.js --preview   post today's preview once and exit
 *   node src/bot.js --finals    post finals not posted yet and exit (good for cron / GitHub Actions)
 *   node src/bot.js --dry-run   print messages instead of sending them
 */
const fs = require('fs');
const path = require('path');
const { loadEnv, api, todayET } = require('./lib');
const fmt = require('./format');

loadEnv(path.join(__dirname, '..', '.env'));

const ARGS = new Set(process.argv.slice(2));
const DRY = ARGS.has('--dry-run');
const LEAGUE = process.env.LEAGUE || 'nba';
const TEAMS = (process.env.TEAMS || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const PREVIEW_HOUR = Number(process.env.PREVIEW_HOUR_ET ?? 12); // hour in US Eastern time
const POLL = Math.max(15, Number(process.env.POLL_SECONDS) || 30); // live data refreshes ~every 10 s
const STATE_FILE = path.join(__dirname, '..', 'state.json');

if (!process.env.RAPIDAPI_KEY) {
  console.error('Missing RAPIDAPI_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}
if (!DRY && !process.env.DISCORD_WEBHOOK_URL && !(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)) {
  console.warn('No DISCORD_WEBHOOK_URL or TELEGRAM_* set – running as --dry-run.');
  ARGS.add('--dry-run');
}

const state = (() => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { posted: {}, periods: {}, previewDay: null }; } })();
const save = () => {
  // keep the file small: forget keys older than ~3 days
  const keys = Object.keys(state.posted);
  if (keys.length > 500) keys.slice(0, keys.length - 500).forEach((k) => delete state.posted[k]);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
};

const wanted = (g) => !TEAMS.length || TEAMS.includes(g.home?.abbreviation) || TEAMS.includes(g.away?.abbreviation);

async function send(msg) {
  if (ARGS.has('--dry-run')) { console.log('\n' + msg.text + '\n'); return; }
  const jobs = [];
  if (process.env.DISCORD_WEBHOOK_URL) {
    jobs.push(fetch(process.env.DISCORD_WEBHOOK_URL, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'Basketball Scores', embeds: msg.embeds }),
    }));
  }
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    jobs.push(fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text: msg.text, disable_web_page_preview: true }),
    }));
  }
  const results = await Promise.allSettled(jobs);
  results.filter((r) => r.status === 'rejected').forEach((r) => console.warn('send failed:', r.reason?.message));
}

async function preview(force = false) {
  const day = todayET();
  if (!force && state.previewDay === day) return;
  const { data } = await api('/v2/predictions', { league: LEAGUE });
  const games = (data || []).filter(wanted);
  state.previewDay = day; save();
  if (!games.length) { console.log('No games today.'); return; }
  await send(fmt.preview(games, LEAGUE));
  console.log(`Posted preview for ${games.length} game(s).`);
}

async function finals(dateParam) {
  const { data } = await api('/v2/games', { league: LEAGUE, ...(dateParam ? { date: dateParam } : {}) });
  for (const g of (data || []).filter(wanted)) {
    const key = `final:${g.id}`;
    if (!g.status?.completed || state.posted[key]) continue;
    await send(fmt.final(g));
    state.posted[key] = Date.now(); save();
    console.log('Posted final: ' + g.shortName);
  }
}

async function live() {
  const { data } = await api('/v2/games/live', { league: LEAGUE });
  for (const g of (data || []).filter(wanted)) {
    const last = state.periods[g.id] || 0;
    const now = g.status?.period || 0;
    // A new period started -> the previous one just ended. Post its score once.
    if (now > last && last > 0) {
      const key = `q:${g.id}:${last}`;
      if (!state.posted[key]) { await send(fmt.quarter(g, last)); state.posted[key] = Date.now(); console.log(`Posted end of period ${last}: ${g.shortName}`); }
    }
    state.periods[g.id] = now;
  }
  save();
}

async function loop() {
  const hourET = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  try {
    if (hourET >= PREVIEW_HOUR) await preview();
    await live();
    await finals();
  } catch (e) {
    console.warn(`[${new Date().toLocaleTimeString()}] ${e.message}`);
  }
  setTimeout(loop, POLL * 1000);
}

(async () => {
  try {
    if (ARGS.has('--preview')) return await preview(true);
    if (ARGS.has('--finals')) {
      await finals();
      // Late games finish after midnight ET: also check yesterday once.
      const y = new Date(Date.now() - 864e5);
      return await finals(todayET(y));
    }
    console.log(`Basketball scores bot running for ${LEAGUE.toUpperCase()}${TEAMS.length ? ' (' + TEAMS.join(', ') + ')' : ''}. Polling every ${POLL}s.`);
    loop();
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
})();
