/** Message builders. Each returns { text, embeds } for Telegram and Discord. */

const pct = (x) => (x == null ? '–' : Math.round(x * 100) + '%');
const color = (hex) => (hex ? parseInt(String(hex).replace('#', ''), 16) : 0xf97316);
const time = (iso) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }) + ' ET';
const ord = (n) => (n <= 4 ? ['', '1st', '2nd', '3rd', '4th'][n] + ' quarter' : `OT${n - 4 > 1 ? n - 4 : ''}`);
const FOOTER = { text: 'Basketball API · rapidapi.com' };

function topScorer(team) {
  const l = (team.leaders || []).find((x) => /points/i.test(x.category || x.label));
  return l ? `${l.player} ${l.value} pts` : null;
}

function preview(games, league) {
  const lines = games.map((g) => {
    const p = g.prediction;
    const fav = p ? (p.predictedWinnerId === g.home.id ? g.home : g.away) : null;
    const favP = p ? (fav === g.home ? p.home.winProbability : p.away.winProbability) : null;
    return `🏀 ${g.away.abbreviation} @ ${g.home.abbreviation} · ${time(g.date)}` +
      (p ? `\n   ${fav.abbreviation} ${pct(favP)} · proj. ${p.away.projectedScore}-${p.home.projectedScore} · total ${p.projectedTotal}` : '');
  });
  const title = `📅 ${league.toUpperCase()} games today (${games.length})`;
  return {
    text: `${title}\n\n${lines.join('\n')}`,
    embeds: [{
      title, color: 0xf97316, footer: FOOTER, timestamp: new Date().toISOString(),
      fields: games.slice(0, 25).map((g) => {
        const p = g.prediction;
        return {
          name: `${g.away.abbreviation} @ ${g.home.abbreviation} · ${time(g.date)}`,
          value: p
            ? `Win %: ${g.away.abbreviation} **${pct(p.away.winProbability)}** · ${g.home.abbreviation} **${pct(p.home.winProbability)}**\nProj: ${p.away.projectedScore}-${p.home.projectedScore} · spread ${p.projectedSpread > 0 ? '+' : ''}${p.projectedSpread} · total ${p.projectedTotal}`
            : 'Prediction not available yet',
        };
      }),
    }],
  };
}

function quarter(g, period) {
  const lead = g.home.score === g.away.score ? 'Tied' : g.home.score > g.away.score ? `${g.home.abbreviation} lead` : `${g.away.abbreviation} lead`;
  const text = `⏱️ End of ${ord(period)}: ${g.away.abbreviation} ${g.away.score} – ${g.home.score} ${g.home.abbreviation} (${lead})`;
  return {
    text,
    embeds: [{ title: `⏱️ End of ${ord(period)}`, description: `**${g.away.name}** ${g.away.score}\n**${g.home.name}** ${g.home.score}\n${lead}`, color: color(g.home.score >= g.away.score ? g.home.color : g.away.color), footer: FOOTER }],
  };
}

function final(g) {
  const w = g.home.winner ? g.home : g.away;
  const l = w === g.home ? g.away : g.home;
  const scorers = [topScorer(g.away) && `${g.away.abbreviation}: ${topScorer(g.away)}`, topScorer(g.home) && `${g.home.abbreviation}: ${topScorer(g.home)}`].filter(Boolean);
  const text = `🏁 FINAL: ${w.name} ${w.score}, ${l.name} ${l.score}` + (scorers.length ? `\n⭐ ${scorers.join(' · ')}` : '');
  return {
    text,
    embeds: [{
      title: `🏁 Final: ${w.abbreviation} ${w.score} – ${l.score} ${l.abbreviation}`,
      description: `**${w.name}** beat ${l.name}` + (w.record ? ` (now ${w.record})` : ''),
      color: color(w.color),
      thumbnail: w.logo ? { url: w.logo } : undefined,
      fields: scorers.length ? [{ name: 'Top scorers', value: scorers.join('\n') }] : [],
      footer: FOOTER, timestamp: new Date().toISOString(),
    }],
  };
}

module.exports = { preview, quarter, final };
