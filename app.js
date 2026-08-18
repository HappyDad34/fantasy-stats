let RAW_DATA = null;
let currentBracketMode = 'championship';

let trajectoryChart = null;
let scatterChart = null;
let consistencyChart = null;

const CHART_PALETTE = [
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f59e0b', '#f97316', '#ef4444', '#14b8a6', '#a855f7',
  '#6366f1', '#84cc16', '#eab308', '#64748b'
];

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('data.json');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    RAW_DATA = await res.json();

    if (typeof Chart !== 'undefined') {
      Chart.defaults.color = '#94a3b8';
      Chart.defaults.borderColor = '#334155';
      Chart.defaults.font.family = 'ui-sans-serif, system-ui, sans-serif';
    }

    initControls();
    initRecapControls();
    initChartControls();
    initKeeperControls();
    initStorylineControls();
    initBracketControls();
    initTradeControls();
    renderAll();
  } catch (err) {
    console.error("Could not load data.json:", err);
    document.getElementById('standings-body').innerHTML = `
      <tr><td colspan="9" class="p-6 text-center text-rose-400">
        Failed to load <code>data.json</code>. Ensure the local server is running: <code>python -m http.server 8000</code>.
      </td></tr>`;
  }
});

function initControls() {
  const startYear = document.getElementById('startYear');
  const endYear = document.getElementById('endYear');
  const queryTeam = document.getElementById('query-team');

  startYear.innerHTML = '';
  endYear.innerHTML = '';
  queryTeam.innerHTML = '';

  RAW_DATA.years.forEach(yr => {
    startYear.add(new Option(yr, yr));
    endYear.add(new Option(yr, yr));
  });
  startYear.value = RAW_DATA.years[0];
  endYear.value = RAW_DATA.years[RAW_DATA.years.length - 1];

  queryTeam.add(new Option("Any Manager", "all"));
  Object.keys(RAW_DATA.manager_profiles).sort().forEach(mName => {
    queryTeam.add(new Option(mName, mName));
  });
}

function initRecapControls() {
  const recapYear = document.getElementById('recapYear');
  if (!recapYear) return;

  recapYear.innerHTML = '';
  RAW_DATA.years.slice().reverse().forEach(yr => {
    recapYear.add(new Option(yr, yr));
  });

  onRecapYearChange();
}

function initChartControls() {
  const select = document.getElementById('chartSeasonSelect');
  if (!select) return;

  select.innerHTML = '';
  RAW_DATA.years.slice().reverse().forEach(yr => {
    select.add(new Option(yr, yr));
  });
}

function initKeeperControls() {
  const select = document.getElementById('keeper-manager-filter');
  if (!select) return;

  select.innerHTML = '';
  select.add(new Option("All Franchises", "all"));
  Object.keys(RAW_DATA.manager_profiles).sort().forEach(mName => {
    select.add(new Option(mName, mName));
  });
}

function initStorylineControls() {
  const select = document.getElementById('narrativeSeasonSelect');
  if (!select) return;

  select.innerHTML = '';
  RAW_DATA.years.slice().reverse().forEach(yr => {
    select.add(new Option(`${yr} Season`, yr));
  });
}

function initBracketControls() {
  const select = document.getElementById('bracketYearSelect');
  if (!select) return;

  select.innerHTML = '';
  RAW_DATA.years.slice().reverse().forEach(yr => {
    select.add(new Option(`${yr} Postseason`, yr));
  });
}

function initTradeControls() {
  const select = document.getElementById('tradeManagerFilter');
  if (!select) return;

  select.innerHTML = '';
  select.add(new Option("All Managers", "all"));
  Object.keys(RAW_DATA.manager_profiles).sort().forEach(mName => {
    select.add(new Option(mName, mName));
  });
}

function onRecapYearChange() {
  const recapYear = parseInt(document.getElementById('recapYear').value);
  const recapWeek = document.getElementById('recapWeek');
  if (!recapWeek) return;

  const weeksForYear = [...new Set(RAW_DATA.matchups.filter(m => m.year === recapYear).map(m => m.week))].sort((a, b) => a - b);

  recapWeek.innerHTML = '';
  weeksForYear.forEach(w => {
    recapWeek.add(new Option(`Week ${w}`, w));
  });

  if (weeksForYear.length > 0) {
    recapWeek.value = weeksForYear[weeksForYear.length - 1];
  }

  renderSeasonBountyBoard(recapYear);
  renderRecap();
}

function switchTab(tabId) {
  ['standings', 'brackets', 'trades', 'storylines', 'dreamteam', 'charts', 'recap', 'badbeats', 'keepers', 'finishes', 'h2h', 'records', 'efficiency', 'positions', 'query'].forEach(t => {
    const view = document.getElementById(`view-${t}`);
    const tab = document.getElementById(`tab-${t}`);
    if (view) view.classList.add('hidden');
    if (tab) tab.className = 'tab-btn py-3 border-b-2 border-transparent font-medium text-slate-400 hover:text-slate-200 whitespace-nowrap';
  });

  const activeView = document.getElementById(`view-${tabId}`);
  const activeTab = document.getElementById(`tab-${tabId}`);
  if (activeView) activeView.classList.remove('hidden');
  if (activeTab) activeTab.className = 'tab-btn py-3 border-b-2 border-emerald-400 font-medium text-emerald-400 whitespace-nowrap';
}

function setBracketMode(mode) {
  currentBracketMode = mode;
  const btnChamp = document.getElementById('btn-bracket-champ');
  const btnConsol = document.getElementById('btn-bracket-consol');

  if (mode === 'championship') {
    btnChamp.className = 'px-3 py-1 text-xs font-bold rounded bg-emerald-600 text-white transition';
    btnConsol.className = 'px-3 py-1 text-xs font-bold rounded text-slate-400 hover:text-white transition';
  } else {
    btnConsol.className = 'px-3 py-1 text-xs font-bold rounded bg-amber-600 text-white transition';
    btnChamp.className = 'px-3 py-1 text-xs font-bold rounded text-slate-400 hover:text-white transition';
  }
  renderBrackets();
}

function getFilteredMatchups() {
  const minYr = parseInt(document.getElementById('startYear').value);
  const maxYr = parseInt(document.getElementById('endYear').value);
  const gameType = document.getElementById('gameType').value;

  return RAW_DATA.matchups.filter(m => {
    const inYear = m.year >= minYr && m.year <= maxYr;
    if (!inYear) return false;
    if (gameType === 'regular') return m.matchup_type === 'REGULAR';
    if (gameType === 'playoff') return m.matchup_type === 'PLAYOFF';
    if (gameType === 'consolation') return m.matchup_type === 'CONSOLATION';
    return true;
  });
}

function getFilteredRosterStats() {
  if (!RAW_DATA.roster_stats) return [];
  const minYr = parseInt(document.getElementById('startYear').value);
  const maxYr = parseInt(document.getElementById('endYear').value);
  const gameType = document.getElementById('gameType').value;

  return RAW_DATA.roster_stats.filter(r => {
    const inYear = r.year >= minYr && r.year <= maxYr;
    if (!inYear) return false;
    if (gameType === 'regular') return r.matchup_type === 'REGULAR';
    if (gameType === 'playoff') return r.matchup_type === 'PLAYOFF';
    if (gameType === 'consolation') return r.matchup_type === 'CONSOLATION';
    return true;
  });
}

function getFilteredTeamsHistory() {
  if (!RAW_DATA.teams_history) return [];
  const minYr = parseInt(document.getElementById('startYear').value);
  const maxYr = parseInt(document.getElementById('endYear').value);
  return RAW_DATA.teams_history.filter(t => t.year >= minYr && t.year <= maxYr);
}

function getFilteredGooseEggs() {
  if (!RAW_DATA.goose_eggs) return [];
  const minYr = parseInt(document.getElementById('startYear').value);
  const maxYr = parseInt(document.getElementById('endYear').value);
  const gameType = document.getElementById('gameType').value;

  return RAW_DATA.goose_eggs.filter(g => {
    const inYear = g.year >= minYr && g.year <= maxYr;
    if (!inYear) return false;
    if (gameType === 'regular') return g.matchup_type === 'REGULAR';
    if (gameType === 'playoff') return g.matchup_type === 'PLAYOFF';
    if (gameType === 'consolation') return g.matchup_type === 'CONSOLATION';
    return true;
  });
}

function getFilteredPlayerSeasons() {
  if (!RAW_DATA.player_seasons) return [];
  const minYr = parseInt(document.getElementById('startYear').value);
  const maxYr = parseInt(document.getElementById('endYear').value);
  return RAW_DATA.player_seasons.filter(ps => ps.year >= minYr && ps.year <= maxYr);
}

function renderAll() {
  const matches = getFilteredMatchups();
  const rosterStats = getFilteredRosterStats();
  const teamsHistory = getFilteredTeamsHistory();
  const gooseEggs = getFilteredGooseEggs();
  const playerSeasons = getFilteredPlayerSeasons();

  renderSummaryCards(matches);
  renderStandings(matches);
  renderBrackets();
  renderTrades();
  renderStorylines();
  renderNarratives();
  renderDreamTeam(playerSeasons);
  renderFinishes(teamsHistory);
  renderH2HMatrix(matches);
  renderRecords(matches);
  renderEfficiency(rosterStats);
  renderPositions(rosterStats);
  renderRecap();
  renderTrajectoryChart();
  renderScatterChart(matches);
  renderConsistencyChart(matches);
  renderKeepers();
  renderBadBeats(matches, gooseEggs);
}

function applyFilters() {
  renderAll();
}

function renderSummaryCards(matches) {
  document.getElementById('stat-total-games').innerText = matches.length;

  let maxScore = 0;
  let minMargin = 999;
  let totalPoints = 0;

  matches.forEach(m => {
    maxScore = Math.max(maxScore, m.home_score, m.away_score);
    if (m.margin > 0) minMargin = Math.min(minMargin, m.margin);
    totalPoints += (m.home_score + m.away_score);
  });

  document.getElementById('stat-high-score').innerText = maxScore > 0 ? maxScore.toFixed(1) : '--';
  document.getElementById('stat-closest-game').innerText = minMargin < 999 ? `${minMargin.toFixed(2)} pts` : '--';
  document.getElementById('stat-avg-ppg').innerText = matches.length ? (totalPoints / (matches.length * 2)).toFixed(1) : '--';
}

function renderStandings(matches) {
  const stats = {};
  Object.keys(RAW_DATA.manager_profiles).forEach(name => {
    stats[name] = { manager: name, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, games: 0, expWins: 0, expLosses: 0 };
  });

  matches.forEach(m => {
    const h = m.home_owner;
    const a = m.away_owner;
    if (!stats[h] || !stats[a]) return;

    stats[h].games++;
    stats[a].games++;
    stats[h].pf += m.home_score;
    stats[h].pa += m.away_score;
    stats[a].pf += m.away_score;
    stats[a].pa += m.home_score;

    if (m.home_score > m.away_score) {
      stats[h].wins++;
      stats[a].losses++;
    } else if (m.away_score > m.home_score) {
      stats[a].wins++;
      stats[h].losses++;
    } else {
      stats[h].ties++;
      stats[a].ties++;
    }
  });

  const weekGroups = {};
  matches.forEach(m => {
    const key = `${m.year}_${m.week}`;
    if (!weekGroups[key]) weekGroups[key] = [];
    weekGroups[key].push({ owner: m.home_owner, score: m.home_score });
    weekGroups[key].push({ owner: m.away_owner, score: m.away_score });
  });

  Object.values(weekGroups).forEach(scores => {
    for (let i = 0; i < scores.length; i++) {
      for (let j = 0; j < scores.length; j++) {
        if (i === j || !stats[scores[i].owner]) continue;
        if (scores[i].score > scores[j].score) stats[scores[i].owner].expWins++;
        else if (scores[i].score < scores[j].score) stats[scores[i].owner].expLosses++;
      }
    }
  });

  const sorted = Object.values(stats)
    .filter(s => s.games > 0)
    .sort((a, b) => (b.wins / b.games) - (a.wins / a.games) || b.pf - a.pf);

  const tbody = document.getElementById('standings-body');
  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">No matchups found for this filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map((s, idx) => {
    const prof = RAW_DATA.manager_profiles[s.manager] || { latest_team_name: s.manager, all_aliases: [] };
    const winPct = (s.wins / s.games).toFixed(3);
    const ppg = (s.pf / s.games).toFixed(1);
    const totalAllPlay = s.expWins + s.expLosses;
    const normExp = totalAllPlay > 0 ? (s.expWins / (totalAllPlay / s.games)).toFixed(1) : 0;
    const luck = (s.wins - normExp).toFixed(1);
    const luckColor = luck > 0 ? 'text-emerald-400' : luck < 0 ? 'text-rose-400' : 'text-slate-400';

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-3 font-semibold text-slate-500">#${idx + 1}</td>
        <td class="p-3">
          <div class="font-bold text-slate-100">${s.manager}</div>
          <div class="text-xs text-slate-400 truncate max-w-[280px]" title="${prof.all_aliases.join(' • ')}">
            ${prof.all_aliases.join(' • ')}
          </div>
        </td>
        <td class="p-3 text-center font-mono">${s.wins}-${s.losses}-${s.ties}</td>
        <td class="p-3 text-center font-mono">${winPct}</td>
        <td class="p-3 text-right font-mono">${s.pf.toFixed(1)}</td>
        <td class="p-3 text-right font-mono">${s.pa.toFixed(1)}</td>
        <td class="p-3 text-right font-mono">${ppg}</td>
        <td class="p-3 text-center font-mono text-slate-400">${normExp}-${(s.games - normExp).toFixed(1)}</td>
        <td class="p-3 text-center font-mono font-bold ${luckColor}">${luck > 0 ? '+' + luck : luck}</td>
      </tr>
    `;
  }).join('');
}

// ----------------------------------------------------
// PLAYOFF & CONSOLATION BRACKET VISUALIZER
// ----------------------------------------------------
function renderBrackets() {
  const container = document.getElementById('bracket-tree-container');
  const select = document.getElementById('bracketYearSelect');
  if (!container || !select || !RAW_DATA || !RAW_DATA.brackets_by_season) return;

  const yr = parseInt(select.value);
  const bracketData = RAW_DATA.brackets_by_season[yr];

  if (!bracketData) {
    container.innerHTML = `<div class="p-6 text-center text-slate-500">No bracket data found for ${yr}.</div>`;
    return;
  }

  const rounds = currentBracketMode === 'championship' ? bracketData.playoff_rounds : bracketData.consolation_rounds;

  if (!rounds || !rounds.length) {
    container.innerHTML = `
      <div class="p-8 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
        No ${currentBracketMode === 'championship' ? 'championship playoff' : 'consolation'} matchups recorded for ${yr}.
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="flex items-start gap-8 min-w-[750px] p-2">
      ${rounds.map((r, rIdx) => `
        <div class="flex-1 space-y-4">
          <div class="text-xs uppercase font-extrabold tracking-wider text-slate-400 pb-1 border-b border-slate-800 flex justify-between items-center">
            <span>${r.round_name}</span>
            <span class="text-[10px] font-mono text-slate-500">Week ${r.week}</span>
          </div>
          <div class="space-y-4">
            ${r.matches.map(m => {
              const homeWon = m.home_score > m.away_score;
              const awayWon = m.away_score > m.home_score;
              const safeHome = m.home_owner.replace(/'/g, "\\'");
              const safeAway = m.away_owner.replace(/'/g, "\\'");

              return `
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-lg hover:border-slate-700 transition space-y-2">
                  <!-- Home Team -->
                  <div class="flex items-center justify-between gap-2">
                    <button onclick="openLineupModal(${m.year}, ${m.week}, '${safeHome}')" class="text-left flex-1 group focus:outline-none truncate">
                      <span class="font-bold text-xs ${homeWon ? 'text-emerald-400' : 'text-slate-300'} group-hover:text-emerald-300 transition">${m.home_owner}</span>
                      <div class="text-[10px] text-slate-500 truncate">${m.home_team}</div>
                    </button>
                    <span class="font-mono text-xs font-bold ${homeWon ? 'text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded' : 'text-slate-500'}">${m.home_score.toFixed(1)}</span>
                  </div>

                  <div class="h-px bg-slate-800/80"></div>

                  <!-- Away Team -->
                  <div class="flex items-center justify-between gap-2">
                    <button onclick="openLineupModal(${m.year}, ${m.week}, '${safeAway}')" class="text-left flex-1 group focus:outline-none truncate">
                      <span class="font-bold text-xs ${awayWon ? 'text-emerald-400' : 'text-slate-300'} group-hover:text-emerald-300 transition">${m.away_owner}</span>
                      <div class="text-[10px] text-slate-500 truncate">${m.away_team}</div>
                    </button>
                    <span class="font-mono text-xs font-bold ${awayWon ? 'text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded' : 'text-slate-500'}">${m.away_score.toFixed(1)}</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ----------------------------------------------------
// TRADE LEDGER & ROI CALCULATOR
// ----------------------------------------------------
function renderTrades() {
  const tbody = document.getElementById('trades-table-body');
  if (!tbody || !RAW_DATA || !RAW_DATA.trades_data) return;

  const minYr = parseInt(document.getElementById('startYear').value);
  const maxYr = parseInt(document.getElementById('endYear').value);
  const selectedManager = document.getElementById('tradeManagerFilter')?.value || 'all';

  const trades = RAW_DATA.trades_data.filter(t => {
    if (t.year < minYr || t.year > maxYr) return false;
    if (selectedManager !== 'all' && t.from_owner !== selectedManager && t.to_owner !== selectedManager) return false;
    return true;
  });

  // Summary Metrics
  document.getElementById('trades-total-count').innerText = trades.length;

  const tradeCounts = {};
  trades.forEach(t => {
    tradeCounts[t.to_owner] = (tradeCounts[t.to_owner] || 0) + 1;
    tradeCounts[t.from_owner] = (tradeCounts[t.from_owner] || 0) + 1;
  });

  const topTrader = Object.entries(tradeCounts).sort((a, b) => b[1] - a[1])[0];
  if (topTrader) {
    document.getElementById('trades-active-manager').innerText = topTrader[0];
    document.getElementById('trades-active-desc').innerText = `${topTrader[1]} total trades executed`;
  }

  const topRoi = [...trades].sort((a, b) => b.pts_produced - a.pts_produced)[0];
  if (topRoi) {
    document.getElementById('trades-top-roi-player').innerText = `${topRoi.player} (${topRoi.pos})`;
    document.getElementById('trades-top-roi-desc').innerText = `${topRoi.pts_produced.toFixed(1)} pts produced for ${topRoi.to_owner} in '${String(topRoi.year).slice(-2)}`;
  }

  if (!trades.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-500">No trade transactions found for this filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = trades.map(t => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-3 font-mono text-slate-400">${t.year}</td>
      <td class="p-3 font-mono text-slate-400">Wk ${t.week}</td>
      <td class="p-3 font-bold text-slate-100">${t.player}</td>
      <td class="p-3 font-mono text-xs text-slate-400">${t.pos}</td>
      <td class="p-3 text-slate-400">${t.from_owner}</td>
      <td class="p-3 font-bold text-slate-200">${t.to_owner}</td>
      <td class="p-3 text-center font-mono text-slate-400">${t.starts}</td>
      <td class="p-3 text-right font-mono font-bold text-emerald-400">${t.pts_produced.toFixed(1)} pts</td>
    </tr>
  `).join('');
}

// ----------------------------------------------------
// STORYLINES & STREAKS
// ----------------------------------------------------
function renderStorylines() {
  const tbody = document.getElementById('streaks-table-body');
  if (!tbody || !RAW_DATA || !RAW_DATA.streaks_data) return;

  const streaks = Object.values(RAW_DATA.streaks_data)
    .filter(s => s.total_games > 0)
    .sort((a, b) => b.longest_win_streak - a.longest_win_streak || a.longest_loss_streak - b.longest_loss_streak);

  if (!streaks.length) return;

  const bestWin = [...streaks].sort((a, b) => b.longest_win_streak - a.longest_win_streak)[0];
  const worstLoss = [...streaks].sort((a, b) => b.longest_loss_streak - a.longest_loss_streak)[0];
  const hotActive = [...streaks].filter(s => s.active_type === 'W').sort((a, b) => b.active_count - a.active_count)[0] || streaks[0];

  document.getElementById('streak-win-manager').innerText = `${bestWin.manager} (${bestWin.longest_win_streak}W)`;
  document.getElementById('streak-win-desc').innerText = `All-time longest win streak across all matchups`;

  document.getElementById('streak-loss-manager').innerText = `${worstLoss.manager} (${worstLoss.longest_loss_streak}L)`;
  document.getElementById('streak-loss-desc').innerText = `All-time longest cold spell in league history`;

  document.getElementById('streak-active-manager').innerText = `${hotActive.manager} (${hotActive.active_count}${hotActive.active_type})`;
  document.getElementById('streak-active-desc').innerText = `Current active momentum streak`;

  tbody.innerHTML = streaks.map(s => {
    const activeBadge = s.active_type === 'W'
      ? `<span class="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">🔥 ${s.active_count}W</span>`
      : s.active_type === 'L'
      ? `<span class="font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">🧊 ${s.active_count}L</span>`
      : `<span class="text-slate-500 font-mono">-</span>`;

    const last5Badges = s.last_5.map(out => {
      if (out === 'W') return `<span class="w-5 h-5 inline-flex items-center justify-center rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">W</span>`;
      if (out === 'L') return `<span class="w-5 h-5 inline-flex items-center justify-center rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">L</span>`;
      return `<span class="w-5 h-5 inline-flex items-center justify-center rounded text-[10px] font-bold bg-slate-800 text-slate-400">T</span>`;
    }).join(' ');

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-2.5 font-bold text-slate-100">${s.manager}</td>
        <td class="p-2.5 text-center font-mono font-bold text-emerald-400">${s.longest_win_streak} Wins</td>
        <td class="p-2.5 text-center font-mono font-bold text-rose-400">${s.longest_loss_streak} Losses</td>
        <td class="p-2.5 text-center">${activeBadge}</td>
        <td class="p-2.5 text-center"><div class="flex justify-center gap-1">${last5Badges}</div></td>
        <td class="p-2.5 text-right font-mono text-slate-400">${s.total_games}</td>
      </tr>
    `;
  }).join('');
}

function renderNarratives() {
  const grid = document.getElementById('narratives-cards-grid');
  const select = document.getElementById('narrativeSeasonSelect');
  if (!grid || !select || !RAW_DATA || !RAW_DATA.season_narratives) return;

  const yr = parseInt(select.value);
  const narrative = RAW_DATA.season_narratives[yr];

  if (!narrative) {
    grid.innerHTML = `<div class="col-span-full text-slate-500 text-sm py-6 text-center">No regular season narrative data for ${yr}.</div>`;
    return;
  }

  const cards = [
    {
      title: "🍀 Regular Season Overachiever",
      manager: narrative.overachiever.owner,
      detail: `+${narrative.overachiever.diff} wins over expected (${narrative.overachiever.wins} Wins vs ${narrative.overachiever.exp_wins} Expected)`,
      badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
    },
    {
      title: "🌧️ Hard Luck Franchise",
      manager: narrative.underachiever.owner,
      detail: `${narrative.underachiever.diff} wins under expected (${narrative.underachiever.wins} Wins vs ${narrative.underachiever.exp_wins} Expected)`,
      badge: "border-rose-500/20 bg-rose-500/10 text-rose-400"
    },
    {
      title: "⚡ The Juggernaut (Scoring Champ)",
      manager: narrative.juggernaut.owner,
      detail: `League-leading ${narrative.juggernaut.pf} Total PF (${narrative.juggernaut.ppg} PPG)`,
      badge: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
    },
    {
      title: "🛡️ The Iron Curtain (Lowest PA)",
      manager: narrative.iron_curtain.owner,
      detail: `Fewest points surrendered: ${narrative.iron_curtain.pa} PA (${narrative.iron_curtain.ppg} Opp PPG)`,
      badge: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400"
    },
    {
      title: "💓 Cardiac Kids (Clutch Wins)",
      manager: narrative.cardiac.owner,
      detail: `${narrative.cardiac.close_wins} victories decided by < 5.0 points`,
      badge: "border-amber-500/20 bg-amber-500/10 text-amber-400"
    },
    {
      title: "💔 Heartbreak Hotel (Nail-Biter Losses)",
      manager: narrative.heartbreak.owner,
      detail: `${narrative.heartbreak.close_losses} heartbreaking losses decided by < 5.0 points`,
      badge: "border-purple-500/20 bg-purple-500/10 text-purple-400"
    }
  ];

  grid.innerHTML = cards.map(c => `
    <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition space-y-3">
      <span class="px-2.5 py-0.5 rounded text-[11px] font-bold font-mono uppercase border w-fit ${c.badge}">${c.title}</span>
      <div>
        <h4 class="text-base font-black text-white tracking-tight">${c.manager}</h4>
        <div class="text-xs text-slate-400 mt-1">${c.detail}</div>
      </div>
    </div>
  `).join('');

  const raceBody = document.getElementById('playoff-race-body');
  document.getElementById('playoff-race-season-badge').innerText = `${yr} Regular Season`;

  if (raceBody && narrative.regular_standings) {
    raceBody.innerHTML = narrative.regular_standings.map((s, idx) => {
      const isPlayoffBound = idx < 6;
      const statusBadge = isPlayoffBound
        ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">🏆 Clinched Top 6</span>`
        : `<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-500 border border-slate-700">Consolation / Toilet Bowl</span>`;

      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="p-2.5 font-bold font-mono ${isPlayoffBound ? 'text-emerald-400' : 'text-slate-500'}">#${idx + 1}</td>
          <td class="p-2.5 font-bold text-slate-100">${s.owner}</td>
          <td class="p-2.5 text-center font-mono font-bold text-slate-200">${s.wins}-${s.losses}</td>
          <td class="p-2.5 text-right font-mono text-emerald-400">${s.pf.toFixed(1)}</td>
          <td class="p-2.5 text-right font-mono text-slate-400">${s.pa.toFixed(1)}</td>
          <td class="p-2.5 text-center font-mono text-slate-400">${s.exp_wins.toFixed(1)}-${(s.games - s.exp_wins).toFixed(1)}</td>
          <td class="p-2.5 text-right">${statusBadge}</td>
        </tr>
      `;
    }).join('');
  }
}

// ----------------------------------------------------
// ALL-TIME DREAM TEAM
// ----------------------------------------------------
function renderDreamTeam(playerSeasons) {
  const grid = document.getElementById('dreamteam-lineup-grid');
  if (!grid || !playerSeasons) return;

  const qbs = playerSeasons.filter(p => p.pos === 'QB').sort((a, b) => b.starter_pts - a.starter_pts);
  const rbs = playerSeasons.filter(p => p.pos === 'RB').sort((a, b) => b.starter_pts - a.starter_pts);
  const wrs = playerSeasons.filter(p => p.pos === 'WR').sort((a, b) => b.starter_pts - a.starter_pts);
  const tes = playerSeasons.filter(p => p.pos === 'TE').sort((a, b) => b.starter_pts - a.starter_pts);
  const dsts = playerSeasons.filter(p => p.pos === 'D/ST').sort((a, b) => b.starter_pts - a.starter_pts);
  const ks = playerSeasons.filter(p => p.pos === 'K').sort((a, b) => b.starter_pts - a.starter_pts);

  const selectedKeys = new Set();

  function pick(pool, count) {
    const chosen = [];
    for (const item of pool) {
      const key = `${item.player}_${item.year}_${item.owner}`;
      if (!selectedKeys.has(key)) {
        selectedKeys.add(key);
        chosen.push(item);
        if (chosen.length === count) break;
      }
    }
    return chosen;
  }

  const qb = pick(qbs, 1)[0];
  const rbList = pick(rbs, 2);
  const wrList = pick(wrs, 2);
  const te = pick(tes, 1)[0];

  const flexPool = [...rbs, ...wrs, ...tes]
    .filter(p => !selectedKeys.has(`${p.player}_${p.year}_${p.owner}`))
    .sort((a, b) => b.starter_pts - a.starter_pts);
  const flex = pick(flexPool, 1)[0];

  const dst = pick(dsts, 1)[0];
  const k = pick(ks, 1)[0];

  const dreamLineup = [
    { slot: 'QB', player: qb, color: 'text-rose-400', badge: 'bg-rose-500/10 border-rose-500/20 text-rose-400' },
    { slot: 'RB1', player: rbList[0], color: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
    { slot: 'RB2', player: rbList[1], color: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
    { slot: 'WR1', player: wrList[0], color: 'text-cyan-400', badge: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' },
    { slot: 'WR2', player: wrList[1], color: 'text-cyan-400', badge: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' },
    { slot: 'TE', player: te, color: 'text-amber-400', badge: 'bg-amber-500/10 border-amber-500/20 text-amber-400' },
    { slot: 'FLEX', player: flex, color: 'text-purple-400', badge: 'bg-purple-500/10 border-purple-500/20 text-purple-400' },
    { slot: 'D/ST', player: dst, color: 'text-blue-400', badge: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
    { slot: 'K', player: k, color: 'text-teal-400', badge: 'bg-teal-500/10 border-teal-500/20 text-teal-400' }
  ];

  let totalDreamPts = 0;
  dreamLineup.forEach(item => {
    if (item.player) totalDreamPts += item.player.starter_pts;
  });
  document.getElementById('dreamteam-total-pts').innerText = `${totalDreamPts.toFixed(1)} PTS`;

  grid.innerHTML = dreamLineup.map(item => {
    const p = item.player;
    if (!p) {
      return `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <span class="text-xs font-mono font-bold uppercase text-slate-500">${item.slot}</span>
          <div class="text-slate-600 text-sm py-4">No data</div>
        </div>
      `;
    }

    return `
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow flex flex-col justify-between hover:border-slate-700 transition space-y-3">
        <div class="flex items-center justify-between">
          <span class="px-2.5 py-0.5 rounded text-xs font-bold font-mono uppercase border ${item.badge}">${item.slot}</span>
          <span class="text-xs font-mono text-slate-400 font-bold bg-slate-800 px-2 py-0.5 rounded">${p.year} Season</span>
        </div>
        <div>
          <h4 class="text-base font-black text-white tracking-tight">${p.player}</h4>
          <div class="text-xs text-slate-400 mt-0.5">Owned by <strong class="text-slate-200">${p.owner}</strong></div>
        </div>
        <div class="flex items-center justify-between pt-2 border-t border-slate-800/80 font-mono text-xs">
          <span class="text-slate-400">${p.starts} Starts • ${p.ppg.toFixed(1)} PPG</span>
          <span class="font-extrabold text-sm ${item.color}">${p.starter_pts.toFixed(1)} pts</span>
        </div>
      </div>
    `;
  }).join('');

  renderDreamLeaderboard();
}

function renderDreamLeaderboard() {
  const tbody = document.getElementById('dream-leaderboard-body');
  if (!tbody || !RAW_DATA || !RAW_DATA.player_seasons) return;

  const selectedPos = document.getElementById('dream-pos-filter')?.value || 'ALL';
  const playerSeasons = getFilteredPlayerSeasons();

  const filtered = playerSeasons
    .filter(p => selectedPos === 'ALL' || p.pos === selectedPos)
    .sort((a, b) => b.starter_pts - a.starter_pts);

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-500">No single-season player records found for this position.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.slice(0, 50).map((p, idx) => {
    let rankBadge = "text-slate-500 font-semibold";
    if (idx === 0) rankBadge = "text-amber-400 font-black";
    else if (idx === 1) rankBadge = "text-slate-300 font-bold";
    else if (idx === 2) rankBadge = "text-amber-600 font-bold";

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-3 ${rankBadge}">#${idx + 1}</td>
        <td class="p-3 font-bold text-slate-100">${p.player}</td>
        <td class="p-3 font-mono text-xs text-slate-400">${p.pos}</td>
        <td class="p-3 font-mono text-slate-300">${p.year}</td>
        <td class="p-3 font-medium text-slate-200">${p.owner}</td>
        <td class="p-3 text-center font-mono text-slate-400">${p.starts}</td>
        <td class="p-3 text-right font-mono font-bold text-emerald-400">${p.starter_pts.toFixed(1)}</td>
        <td class="p-3 text-right font-mono text-slate-300">${p.ppg.toFixed(1)}</td>
      </tr>
    `;
  }).join('');
}

// ----------------------------------------------------
// BAD BEAT HALL OF FAME
// ----------------------------------------------------
function renderBadBeats(matches, gooseEggs) {
  const victimBody = document.getElementById('badbeat-victim-body');
  if (!victimBody) return;

  const losingMatchups = [];
  matches.forEach(m => {
    if (m.home_score !== m.away_score) {
      const loserIsHome = m.home_score < m.away_score;
      const loserOwner = loserIsHome ? m.home_owner : m.away_owner;
      const loserTeam = loserIsHome ? m.home_team_name : m.away_team_name;
      const loserScore = loserIsHome ? m.home_score : m.away_score;
      const winnerOwner = loserIsHome ? m.away_owner : m.home_owner;
      const winnerScore = loserIsHome ? m.away_score : m.home_score;

      losingMatchups.push({
        year: m.year,
        week: m.week,
        loser_owner: loserOwner,
        loser_team: loserTeam,
        loser_score: loserScore,
        winner_owner: winnerOwner,
        winner_score: winnerScore,
        margin: m.margin
      });
    }
  });

  const highestLosses = [...losingMatchups].sort((a, b) => b.loser_score - a.loser_score).slice(0, 10);
  const highestLossesList = document.getElementById('highest-losses-list');
  if (highestLossesList) {
    if (!highestLosses.length) {
      highestLossesList.innerHTML = `<li class="text-slate-500 text-xs py-2">No losing matchups recorded.</li>`;
    } else {
      highestLossesList.innerHTML = highestLosses.map((item, idx) => `
        <li class="flex justify-between items-center border-b border-slate-800/60 pb-2">
          <div>
            <span class="font-bold text-slate-500 mr-2">#${idx + 1}</span>
            <strong class="text-rose-400 font-mono">${item.loser_score.toFixed(1)} pts</strong> -
            <span class="text-slate-200 font-semibold">${item.loser_owner}</span>
            <span class="text-xs text-slate-400">vs ${item.winner_owner} (${item.winner_score.toFixed(1)})</span>
          </div>
          <span class="text-xs font-mono text-slate-500">${item.year} Wk ${item.week}</span>
        </li>
      `).join('');
    }
  }

  const heartbreaks = [...losingMatchups].filter(m => m.margin > 0).sort((a, b) => a.margin - b.margin).slice(0, 10);
  const heartbreakList = document.getElementById('heartbreak-losses-list');
  if (heartbreakList) {
    if (!heartbreaks.length) {
      heartbreakList.innerHTML = `<li class="text-slate-500 text-xs py-2">No close losses recorded.</li>`;
    } else {
      heartbreakList.innerHTML = heartbreaks.map((item, idx) => `
        <li class="flex justify-between items-center border-b border-slate-800/60 pb-2">
          <div>
            <span class="font-bold text-slate-500 mr-2">#${idx + 1}</span>
            <strong class="text-amber-400 font-mono">-${item.margin.toFixed(2)} pts</strong> -
            <span class="text-slate-200 font-semibold">${item.loser_owner}</span>
            <span class="text-xs text-slate-400">(${item.loser_score.toFixed(1)} vs ${item.winner_score.toFixed(1)})</span>
          </div>
          <span class="text-xs font-mono text-slate-500">${item.year} Wk ${item.week}</span>
        </li>
      `).join('');
    }
  }

  const painMap = {};
  Object.keys(RAW_DATA.manager_profiles).forEach(m => {
    painMap[m] = { manager: m, total_losses: 0, high_losses: 0, nail_biters: 0, goose_eggs: 0, pain_score: 0 };
  });

  losingMatchups.forEach(l => {
    if (!painMap[l.loser_owner]) painMap[l.loser_owner] = { manager: l.loser_owner, total_losses: 0, high_losses: 0, nail_biters: 0, goose_eggs: 0, pain_score: 0 };
    painMap[l.loser_owner].total_losses += 1;
    if (l.loser_score >= 130.0) painMap[l.loser_owner].high_losses += 1;
    if (l.margin < 3.0) painMap[l.loser_owner].nail_biters += 1;
  });

  gooseEggs.forEach(g => {
    if (painMap[g.owner]) painMap[g.owner].goose_eggs += 1;
  });

  Object.values(painMap).forEach(p => {
    p.pain_score = (p.high_losses * 3) + (p.nail_biters * 2) + (p.goose_eggs * 1.5);
  });

  const sortedPain = Object.values(painMap)
    .filter(p => p.total_losses > 0 || p.goose_eggs > 0)
    .sort((a, b) => b.pain_score - a.pain_score || b.high_losses - a.high_losses);

  victimBody.innerHTML = sortedPain.map((p, idx) => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-2.5 font-bold text-slate-500">#${idx + 1}</td>
      <td class="p-2.5 font-bold text-slate-100">${p.manager}</td>
      <td class="p-2.5 text-center font-mono font-bold text-rose-400 bg-rose-500/10 rounded">${p.pain_score.toFixed(1)}</td>
      <td class="p-2.5 text-center font-mono ${p.high_losses > 0 ? 'text-amber-400 font-bold' : 'text-slate-500'}">${p.high_losses}</td>
      <td class="p-2.5 text-center font-mono ${p.nail_biters > 0 ? 'text-amber-400 font-bold' : 'text-slate-500'}">${p.nail_biters}</td>
      <td class="p-2.5 text-center font-mono ${p.goose_eggs > 0 ? 'text-purple-400 font-bold' : 'text-slate-500'}">${p.goose_eggs}</td>
      <td class="p-2.5 text-right font-mono text-slate-400">${p.total_losses}</td>
    </tr>
  `).join('');

  if (highestLosses.length > 0) {
    const topLoser = highestLosses[0];
    document.getElementById('badbeat-high-loser').innerText = `${topLoser.loser_score.toFixed(1)} pts (${topLoser.loser_owner})`;
    document.getElementById('badbeat-high-desc').innerText = `Lost to ${topLoser.winner_owner} (${topLoser.winner_score.toFixed(1)}) in ${topLoser.year} Wk ${topLoser.week}`;
  }

  if (heartbreaks.length > 0) {
    const topClose = heartbreaks[0];
    document.getElementById('badbeat-narrow-match').innerText = `-${topClose.margin.toFixed(2)} pts (${topClose.loser_owner})`;
    document.getElementById('badbeat-narrow-desc').innerText = `${topClose.loser_score.toFixed(1)} vs ${topClose.winner_score.toFixed(1)} (${topClose.winner_owner}, ${topClose.year} Wk ${topClose.week})`;
  }

  if (sortedPain.length > 0) {
    const unluckiest = sortedPain[0];
    document.getElementById('badbeat-victim-name').innerText = unluckiest.manager;
    document.getElementById('badbeat-victim-desc').innerText = `${unluckiest.high_losses} losses ≥ 130 pts • ${unluckiest.nail_biters} losses < 3 pts`;
  }

  const gooseBody = document.getElementById('goose-egg-body');
  document.getElementById('goose-egg-total-count').innerText = `${gooseEggs.length} Goose Eggs`;

  if (!gooseEggs.length) {
    gooseBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">No starting goose eggs found for this filter.</td></tr>`;
    return;
  }

  const sortedGoose = [...gooseEggs].sort((a, b) => a.points - b.points || b.year - a.year);
  gooseBody.innerHTML = sortedGoose.slice(0, 25).map(g => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-2.5 font-mono text-slate-400">${g.year}</td>
      <td class="p-2.5 font-mono text-slate-400">Wk ${g.week}</td>
      <td class="p-2.5 font-bold text-slate-100">${g.owner}</td>
      <td class="p-2.5 font-bold text-rose-400">${g.player}</td>
      <td class="p-2.5 font-mono text-xs text-slate-400">${g.pos}</td>
      <td class="p-2.5 font-mono text-xs text-slate-400">${g.slot}</td>
      <td class="p-2.5 text-right font-mono font-bold text-rose-400">${g.points.toFixed(1)}</td>
    </tr>
  `).join('');
}

// ----------------------------------------------------
// KEEPERS & FRANCHISE CORNERSTONES
// ----------------------------------------------------
function renderKeepers() {
  const tbody = document.getElementById('keepers-table-body');
  if (!tbody || !RAW_DATA || !RAW_DATA.cornerstone_stats) return;

  const minYr = parseInt(document.getElementById('startYear').value);
  const maxYr = parseInt(document.getElementById('endYear').value);
  const selectedManager = document.getElementById('keeper-manager-filter')?.value || 'all';
  const minSeasons = parseInt(document.getElementById('keeper-min-seasons')?.value || 2);

  const filtered = RAW_DATA.cornerstone_stats.filter(c => {
    if (selectedManager !== 'all' && c.owner !== selectedManager) return false;
    if (c.seasons < minSeasons) return false;
    const hasYearOverlap = c.years_list.some(y => y >= minYr && y <= maxYr);
    return hasYearOverlap;
  }).sort((a, b) => b.starter_pts - a.starter_pts || b.seasons - a.seasons);

  const allMultiYear = RAW_DATA.cornerstone_stats.filter(c => c.seasons >= 2);
  document.getElementById('keeper-total-count').innerText = allMultiYear.length;

  if (allMultiYear.length > 0) {
    const goat = [...allMultiYear].sort((a, b) => b.starter_pts - a.starter_pts)[0];
    const longestTenure = [...allMultiYear].sort((a, b) => b.seasons - a.seasons || b.starter_pts - a.starter_pts)[0];

    document.getElementById('keeper-goat-player').innerText = `${goat.player} (${goat.pos})`;
    document.getElementById('keeper-goat-desc').innerText = `${goat.starter_pts.toFixed(1)} starter pts for ${goat.owner} (${goat.years_display})`;

    document.getElementById('keeper-tenure-player').innerText = `${longestTenure.player} (${longestTenure.pos})`;
    document.getElementById('keeper-tenure-desc').innerText = `${longestTenure.seasons} Seasons with ${longestTenure.owner} (${longestTenure.years_display})`;
  }

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">No franchise cornerstones found matching this filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((c, idx) => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-3 font-semibold text-slate-500">#${idx + 1}</td>
      <td class="p-3 font-bold text-slate-100">${c.player}</td>
      <td class="p-3 font-mono text-xs text-slate-400">${c.pos}</td>
      <td class="p-3 font-medium text-slate-200">${c.owner}</td>
      <td class="p-3 text-center font-mono font-bold ${c.seasons >= 3 ? 'text-amber-400 bg-amber-500/10 rounded' : 'text-slate-300'}">${c.seasons}</td>
      <td class="p-3">
        <div class="flex flex-wrap gap-1">
          ${c.years_list.map(y => `<span class="px-2 py-0.5 rounded text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700">'${String(y).slice(-2)}</span>`).join('')}
        </div>
      </td>
      <td class="p-3 text-center font-mono text-slate-400">${c.starter_games}</td>
      <td class="p-3 text-right font-mono font-bold text-emerald-400">${c.starter_pts.toFixed(1)}</td>
      <td class="p-3 text-right font-mono text-slate-300">${c.starter_ppg.toFixed(1)}</td>
    </tr>
  `).join('');
}

// ----------------------------------------------------
// CHART 1: Cumulative Trajectory Line Chart
// ----------------------------------------------------
function renderTrajectoryChart() {
  const canvas = document.getElementById('trajectoryCanvas');
  const select = document.getElementById('chartSeasonSelect');
  if (!canvas || !select || !RAW_DATA) return;

  const yr = parseInt(select.value);
  const seasonMatches = RAW_DATA.matchups.filter(m => m.year === yr && m.matchup_type === 'REGULAR');
  const weeks = [...new Set(seasonMatches.map(m => m.week))].sort((a, b) => a - b);

  const managerWeeklyScores = {};
  seasonMatches.forEach(m => {
    if (!managerWeeklyScores[m.home_owner]) managerWeeklyScores[m.home_owner] = {};
    if (!managerWeeklyScores[m.away_owner]) managerWeeklyScores[m.away_owner] = {};
    managerWeeklyScores[m.home_owner][m.week] = m.home_score;
    managerWeeklyScores[m.away_owner][m.week] = m.away_score;
  });

  const datasets = Object.keys(managerWeeklyScores).map((owner, idx) => {
    let runningTotal = 0;
    const data = weeks.map(w => {
      runningTotal += (managerWeeklyScores[owner][w] || 0);
      return Math.round(runningTotal * 10) / 10;
    });

    const color = CHART_PALETTE[idx % CHART_PALETTE.length];
    return {
      label: owner,
      data: data,
      borderColor: color,
      backgroundColor: color,
      tension: 0.25,
      pointRadius: 3,
      pointHoverRadius: 6,
      borderWidth: 2
    };
  });

  if (trajectoryChart) trajectoryChart.destroy();

  trajectoryChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: weeks.map(w => `Week ${w}`),
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} pts`
          }
        }
      },
      scales: {
        y: {
          title: { display: true, text: 'Cumulative Points' },
          grid: { color: '#1e293b' }
        },
        x: { grid: { color: '#1e293b' } }
      }
    }
  });
}

// ----------------------------------------------------
// CHART 2: Luck vs. Skill Scatter Plot
// ----------------------------------------------------
function renderScatterChart(matches) {
  const canvas = document.getElementById('scatterCanvas');
  if (!canvas || !RAW_DATA) return;

  const stats = {};
  matches.forEach(m => {
    [
      { o: m.home_owner, score: m.home_score, opp: m.away_score },
      { o: m.away_owner, score: m.away_score, opp: m.home_score }
    ].forEach(({ o, score, opp }) => {
      if (!stats[o]) stats[o] = { owner: o, wins: 0, games: 0, pf: 0 };
      stats[o].games += 1;
      stats[o].pf += score;
      if (score > opp) stats[o].wins += 1;
      else if (score === opp) stats[o].wins += 0.5;
    });
  });

  const managers = Object.values(stats).filter(s => s.games > 0);
  if (!managers.length) {
    if (scatterChart) scatterChart.destroy();
    return;
  }

  const scatterData = managers.map(m => ({
    x: Math.round((m.pf / m.games) * 10) / 10,
    y: Math.round(((m.wins / m.games) * 100) * 10) / 10,
    owner: m.owner,
    games: m.games,
    wins: m.wins
  }));

  if (scatterChart) scatterChart.destroy();

  scatterChart = new Chart(canvas, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Managers',
        data: scatterData,
        backgroundColor: CHART_PALETTE.slice(0, scatterData.length),
        pointRadius: 8,
        pointHoverRadius: 11
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const raw = ctx.raw;
              return ` ${raw.owner}: ${raw.y}% Win Rate (${raw.x} PPG across ${raw.games} Gms)`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Points Per Game (PPG)' },
          grid: { color: '#1e293b' }
        },
        y: {
          title: { display: true, text: 'Win Percentage (%)' },
          min: 0,
          max: 100,
          grid: { color: '#1e293b' }
        }
      }
    }
  });
}

// ----------------------------------------------------
// CHART 3: Consistency Floor vs Ceiling
// ----------------------------------------------------
function renderConsistencyChart(matches) {
  const canvas = document.getElementById('consistencyCanvas');
  if (!canvas || !RAW_DATA) return;

  const scoreMap = {};
  matches.forEach(m => {
    if (!scoreMap[m.home_owner]) scoreMap[m.home_owner] = [];
    if (!scoreMap[m.away_owner]) scoreMap[m.away_owner] = [];
    scoreMap[m.home_owner].push(m.home_score);
    scoreMap[m.away_owner].push(m.away_score);
  });

  const list = Object.entries(scoreMap)
    .filter(([_, scores]) => scores.length > 0)
    .map(([owner, scores]) => {
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return { owner, min, avg, max };
    })
    .sort((a, b) => b.avg - a.avg);

  if (consistencyChart) consistencyChart.destroy();

  consistencyChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: list.map(l => l.owner),
      datasets: [
        {
          label: 'Floor (Min Score)',
          data: list.map(l => Math.round(l.min * 10) / 10),
          backgroundColor: '#f43f5e99',
          borderColor: '#f43f5e',
          borderWidth: 1
        },
        {
          label: 'Average PPG',
          data: list.map(l => Math.round(l.avg * 10) / 10),
          backgroundColor: '#06b6d4',
          borderColor: '#06b6d4',
          borderWidth: 1
        },
        {
          label: 'Ceiling (Max Score)',
          data: list.map(l => Math.round(l.max * 10) / 10),
          backgroundColor: '#10b981',
          borderColor: '#10b981',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} pts`
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#1e293b' },
          ticks: { font: { size: 10 } }
        },
        y: {
          title: { display: true, text: 'Weekly Score (pts)' },
          grid: { color: '#1e293b' }
        }
      }
    }
  });
}

function renderRecap() {
  const recapYearEl = document.getElementById('recapYear');
  const recapWeekEl = document.getElementById('recapWeek');
  if (!recapYearEl || !recapWeekEl || !recapYearEl.value || !recapWeekEl.value) return;

  const yr = parseInt(recapYearEl.value);
  const wk = parseInt(recapWeekEl.value);

  const weekMatches = RAW_DATA.matchups.filter(m => m.year === yr && m.week === wk);

  if (!weekMatches.length) {
    document.getElementById('recap-matchups-list').innerHTML = `<div class="text-slate-500 text-sm py-4 text-center">No matchups recorded for Year ${yr}, Week ${wk}.</div>`;
    return;
  }

  let topScore = -1, lowScore = 999;
  let king = "Unknown", chump = "Unknown";
  let minMargin = 999, nailMatch = "N/A";

  weekMatches.forEach(m => {
    if (m.home_score > topScore) { topScore = m.home_score; king = m.home_owner; }
    if (m.away_score > topScore) { topScore = m.away_score; king = m.away_owner; }

    if (m.home_score < lowScore) { lowScore = m.home_score; chump = m.home_owner; }
    if (m.away_score < lowScore) { lowScore = m.away_score; chump = m.away_owner; }

    if (m.margin > 0 && m.margin < minMargin) {
      minMargin = m.margin;
      nailMatch = `${m.winner_owner} def. ${m.winner_owner === m.home_owner ? m.away_owner : m.home_owner}`;
    }
  });

  document.getElementById('recap-king-name').innerText = king;
  document.getElementById('recap-king-pts').innerText = `${topScore.toFixed(2)} pts`;

  document.getElementById('recap-chump-name').innerText = chump;
  document.getElementById('recap-chump-pts').innerText = `${lowScore.toFixed(2)} pts`;

  document.getElementById('recap-nail-match').innerText = nailMatch;
  document.getElementById('recap-nail-margin').innerText = minMargin < 999 ? `+${minMargin.toFixed(2)} pts margin` : '--';

  const key = `${yr}_${wk}`;
  const weekPlayerData = RAW_DATA.weekly_players ? RAW_DATA.weekly_players[key] : null;
  const blunder = weekPlayerData?.bench_blunder;

  if (blunder) {
    document.getElementById('recap-bench-player').innerText = `${blunder.name} (${blunder.pos})`;
    document.getElementById('recap-bench-owner').innerText = `${blunder.points.toFixed(1)} pts on ${blunder.owner}'s bench`;
  } else {
    document.getElementById('recap-bench-player').innerText = "None";
    document.getElementById('recap-bench-owner').innerText = "--";
  }

  document.getElementById('recap-game-count').innerText = `${weekMatches.length} Matchups`;
  const matchupsList = document.getElementById('recap-matchups-list');
  matchupsList.innerHTML = weekMatches.map(m => {
    const homeWon = m.home_score > m.away_score;
    const awayWon = m.away_score > m.home_score;
    const safeHome = m.home_owner.replace(/'/g, "\\'");
    const safeAway = m.away_owner.replace(/'/g, "\\'");

    return `
      <div class="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 flex items-center justify-between gap-2 hover:border-slate-700 transition">
        <button onclick="openLineupModal(${yr}, ${wk}, '${safeHome}')" class="flex-1 text-left group focus:outline-none">
          <div class="font-bold text-sm ${homeWon ? 'text-emerald-400' : 'text-slate-300'} group-hover:text-emerald-300 flex items-center gap-1.5 transition">
            <span>${m.home_owner}</span>
            <span class="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition">🔍</span>
          </div>
          <div class="text-xs text-slate-500 truncate max-w-[150px]">${m.home_team_name}</div>
        </button>

        <div class="text-center px-3 py-1 bg-slate-900 rounded border border-slate-800 font-mono text-sm font-bold">
          <span class="${homeWon ? 'text-emerald-400' : 'text-slate-400'}">${m.home_score.toFixed(1)}</span>
          <span class="text-slate-600 px-1">-</span>
          <span class="${awayWon ? 'text-emerald-400' : 'text-slate-400'}">${m.away_score.toFixed(1)}</span>
        </div>

        <button onclick="openLineupModal(${yr}, ${wk}, '${safeAway}')" class="flex-1 text-right group focus:outline-none">
          <div class="font-bold text-sm ${awayWon ? 'text-emerald-400' : 'text-slate-300'} group-hover:text-emerald-300 flex items-center justify-end gap-1.5 transition">
            <span class="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition">🔍</span>
            <span>${m.away_owner}</span>
          </div>
          <div class="text-xs text-slate-500 truncate max-w-[150px] ml-auto">${m.away_team_name}</div>
        </button>
      </div>
    `;
  }).join('');

  const topPlayersBody = document.getElementById('recap-top-players-body');
  if (!weekPlayerData || !weekPlayerData.top_performers || !weekPlayerData.top_performers.length) {
    topPlayersBody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No player box scores recorded for this week.</td></tr>`;
    return;
  }

  topPlayersBody.innerHTML = weekPlayerData.top_performers.slice(0, 10).map((p, idx) => {
    const badge = p.is_starter
      ? `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Started by ${p.owner}</span>`
      : `<span class="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Benched by ${p.owner}</span>`;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-2 font-bold text-slate-500">#${idx + 1}</td>
        <td class="p-2 font-bold text-slate-100">${p.name}</td>
        <td class="p-2 font-mono text-xs text-slate-400">${p.pos}</td>
        <td class="p-2 text-right font-mono font-bold text-emerald-400">${p.points.toFixed(1)}</td>
        <td class="p-2 text-right">${badge}</td>
      </tr>
    `;
  }).join('');
}

function renderSeasonBountyBoard(yr) {
  const tbody = document.getElementById('season-bounty-body');
  if (!tbody) return;

  const yearMatches = RAW_DATA.matchups.filter(m => m.year === yr && m.matchup_type === 'REGULAR');
  const weekGroups = {};
  yearMatches.forEach(m => {
    if (!weekGroups[m.week]) weekGroups[m.week] = [];
    weekGroups[m.week].push({ owner: m.home_owner, score: m.home_score });
    weekGroups[m.week].push({ owner: m.away_owner, score: m.away_score });
  });

  const totalWeeks = Object.keys(weekGroups).length;
  document.getElementById('recap-season-weeks-count').innerText = `${totalWeeks} Regular Season Weeks`;

  const bountyMap = {};
  Object.keys(RAW_DATA.manager_profiles).forEach(m => {
    bountyMap[m] = { manager: m, count: 0, weeks: [], topScore: 0 };
  });

  Object.entries(weekGroups).forEach(([weekNum, scores]) => {
    scores.sort((a, b) => b.score - a.score);
    if (scores.length > 0) {
      const top = scores[0];
      if (!bountyMap[top.owner]) {
        bountyMap[top.owner] = { manager: top.owner, count: 0, weeks: [], topScore: 0 };
      }
      bountyMap[top.owner].count += 1;
      bountyMap[top.owner].weeks.push({ week: parseInt(weekNum), score: top.score });
      bountyMap[top.owner].topScore = Math.max(bountyMap[top.owner].topScore, top.score);
    }
  });

  const sorted = Object.values(bountyMap)
    .filter(b => b.count > 0)
    .sort((a, b) => b.count - a.count || b.topScore - a.topScore);

  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No regular season matchup data found for ${yr}.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map((b, idx) => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-2.5 font-bold text-slate-500">#${idx + 1}</td>
      <td class="p-2.5 font-bold text-slate-100">${b.manager}</td>
      <td class="p-2.5 text-center font-mono font-bold text-amber-400 bg-amber-500/10 rounded">${b.count}</td>
      <td class="p-2.5">
        <div class="flex flex-wrap gap-1.5">
          ${b.weeks.map(w => `<span class="px-2 py-0.5 rounded text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700">Wk ${w.week} <strong class="text-emerald-400">(${w.score.toFixed(1)})</strong></span>`).join('')}
        </div>
      </td>
      <td class="p-2.5 text-right font-mono font-bold text-emerald-400">${b.topScore.toFixed(1)}</td>
    </tr>
  `).join('');
}

function renderFinishes(teamsHistory) {
  const tbody = document.getElementById('finishes-body');
  if (!tbody) return;

  if (!teamsHistory || teamsHistory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">No season finish data available.</td></tr>`;
    return;
  }

  const finishMap = {};
  Object.keys(RAW_DATA.manager_profiles).forEach(m => {
    finishMap[m] = { manager: m, seasons: 0, first: 0, second: 0, third: 0, fourth: 0, mid: 0, low: 0 };
  });

  teamsHistory.forEach(t => {
    const m = t.owner_name;
    if (!finishMap[m]) finishMap[m] = { manager: m, seasons: 0, first: 0, second: 0, third: 0, fourth: 0, mid: 0, low: 0 };
    finishMap[m].seasons += 1;

    const rank = t.final_standing;
    if (rank === 1) finishMap[m].first += 1;
    else if (rank === 2) finishMap[m].second += 1;
    else if (rank === 3) finishMap[m].third += 1;
    else if (rank === 4) finishMap[m].fourth += 1;
    else if (rank >= 5 && rank <= 6) finishMap[m].mid += 1;
    else if (rank >= 7) finishMap[m].low += 1;
  });

  const sortedFinishes = Object.values(finishMap)
    .filter(f => f.seasons > 0)
    .sort((a, b) => b.first - a.first || b.second - a.second || b.third - a.third || b.seasons - a.seasons);

  tbody.innerHTML = sortedFinishes.map(f => {
    const podiumCount = f.first + f.second + f.third;
    const podiumRate = f.seasons > 0 ? ((podiumCount / f.seasons) * 100).toFixed(0) : 0;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-3 font-bold text-slate-100">${f.manager}</td>
        <td class="p-3 text-center font-mono text-slate-400">${f.seasons}</td>
        <td class="p-3 text-center font-mono font-bold ${f.first > 0 ? 'text-amber-400 bg-amber-500/10 rounded' : 'text-slate-600'}">${f.first}</td>
        <td class="p-3 text-center font-mono font-bold ${f.second > 0 ? 'text-slate-300 bg-slate-500/10 rounded' : 'text-slate-600'}">${f.second}</td>
        <td class="p-3 text-center font-mono font-bold ${f.third > 0 ? 'text-amber-600 bg-amber-700/10 rounded' : 'text-slate-600'}">${f.third}</td>
        <td class="p-3 text-center font-mono ${f.fourth > 0 ? 'text-slate-300' : 'text-slate-600'}">${f.fourth}</td>
        <td class="p-3 text-center font-mono ${f.mid > 0 ? 'text-slate-400' : 'text-slate-600'}">${f.mid}</td>
        <td class="p-3 text-center font-mono ${f.low > 0 ? 'text-slate-500' : 'text-slate-600'}">${f.low}</td>
        <td class="p-3 text-right font-mono font-bold ${podiumRate >= 50 ? 'text-emerald-400' : 'text-slate-400'}">${podiumRate}%</td>
      </tr>
    `;
  }).join('');
}

function renderH2HMatrix(matches) {
  const activeManagers = Object.keys(RAW_DATA.manager_profiles).filter(m => {
    return matches.some(match => match.home_owner === m || match.away_owner === m);
  }).sort();

  const matrix = {};
  activeManagers.forEach(m1 => {
    matrix[m1] = {};
    activeManagers.forEach(m2 => { matrix[m1][m2] = { w: 0, l: 0, t: 0 }; });
  });

  matches.forEach(m => {
    const h = m.home_owner;
    const a = m.away_owner;
    if (!matrix[h] || !matrix[a]) return;

    if (m.home_score > m.away_score) {
      matrix[h][a].w++;
      matrix[a][h].l++;
    } else if (m.away_score > m.home_score) {
      matrix[a][h].w++;
      matrix[h][a].l++;
    } else {
      matrix[h][a].t++;
      matrix[a][h].t++;
    }
  });

  let tableHtml = `<table class="w-full text-xs text-center border-collapse"><thead><tr><th class="p-2 text-left bg-slate-800 text-slate-300">Manager (Row vs Col)</th>`;
  activeManagers.forEach(m => { tableHtml += `<th class="p-2 bg-slate-800 text-slate-300 truncate max-w-[85px]" title="${m}">${m}</th>`; });
  tableHtml += `</tr></thead><tbody>`;

  activeManagers.forEach(r => {
    tableHtml += `<tr><td class="p-2 text-left font-medium text-slate-200 bg-slate-800/40 truncate max-w-[120px]" title="${r}">${r}</td>`;
    activeManagers.forEach(c => {
      if (r === c) {
        tableHtml += `<td class="p-2 bg-slate-900/60 text-slate-600">-</td>`;
      } else {
        const cell = matrix[r][c];
        const color = cell.w > cell.l ? 'text-emerald-400 font-semibold' : cell.l > cell.w ? 'text-rose-400' : 'text-slate-400';
        tableHtml += `<td class="p-2 border border-slate-800/50 ${color}">${cell.w}-${cell.l}</td>`;
      }
    });
    tableHtml += `</tr>`;
  });
  tableHtml += `</tbody></table>`;
  document.getElementById('h2h-container').innerHTML = tableHtml;
}

function renderRecords(matches) {
  const allScores = [];
  matches.forEach(m => {
    allScores.push({ year: m.year, week: m.week, owner: m.home_owner, team: m.home_team_name, score: m.home_score });
    allScores.push({ year: m.year, week: m.week, owner: m.away_owner, team: m.away_team_name, score: m.away_score });
  });

  const highest = [...allScores].sort((a, b) => b.score - a.score).slice(0, 10);
  const lowest = [...allScores].filter(s => s.score > 0).sort((a, b) => a.score - b.score).slice(0, 10);
  const blowouts = [...matches].sort((a, b) => b.margin - a.margin).slice(0, 10);
  const closest = [...matches].filter(m => m.margin > 0).sort((a, b) => a.margin - b.margin).slice(0, 10);

  const populateList = (elemId, list, formatFn) => {
    const el = document.getElementById(elemId);
    if (!el) return;
    if (!list.length) {
      el.innerHTML = `<li class="text-slate-500 text-xs py-2">No records found.</li>`;
      return;
    }
    el.innerHTML = list.map((item, i) => `
      <li class="flex justify-between border-b border-slate-800/60 pb-1.5">
        <span class="text-slate-300"><strong class="text-slate-500 mr-2">#${i+1}</strong> ${formatFn(item)}</span>
        <span class="text-xs text-slate-500">${item.year} Wk ${item.week}</span>
      </li>
    `).join('');
  };

  populateList('highest-scores-list', highest, item => `<span class="font-medium text-emerald-400">${item.score.toFixed(1)} pts</span> - ${item.owner} <span class="text-xs text-slate-400">(${item.team})</span>`);
  populateList('lowest-scores-list', lowest, item => `<span class="font-medium text-rose-400">${item.score.toFixed(1)} pts</span> - ${item.owner} <span class="text-xs text-slate-400">(${item.team})</span>`);
  populateList('blowouts-list', blowouts, item => `<span class="font-medium">${item.winner_owner}</span> (+${item.margin.toFixed(1)}) vs ${item.winner_owner === item.home_owner ? item.away_owner : item.home_owner}`);
  populateList('closest-list', closest, item => `<span class="font-medium">${item.winner_owner}</span> (+${item.margin.toFixed(2)}) vs ${item.winner_owner === item.home_owner ? item.away_owner : item.home_owner}`);
}

function renderEfficiency(rosterStats) {
  const tbody = document.getElementById('efficiency-body');
  if (!tbody) return;

  if (!rosterStats || rosterStats.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-500">No roster entries match this filter criteria.</td></tr>`;
    return;
  }

  const managerMap = {};
  rosterStats.forEach(r => {
    if (!managerMap[r.owner]) {
      managerMap[r.owner] = { owner: r.owner, start_pts: 0, bench_pts: 0, games: 0 };
    }
    managerMap[r.owner].start_pts += r.start_pts;
    managerMap[r.owner].bench_pts += r.bench_pts;
    managerMap[r.owner].games += 1;
  });

  const list = Object.values(managerMap)
    .filter(m => m.games > 0)
    .map(m => {
      const avgStart = m.start_pts / m.games;
      const avgBench = m.bench_pts / m.games;
      const benchRatio = avgStart > 0 ? (avgBench / avgStart) * 100 : 0;
      return { ...m, avgStart, avgBench, benchRatio };
    })
    .sort((a, b) => a.benchRatio - b.benchRatio);

  tbody.innerHTML = list.map((item, idx) => {
    let rankBadge = "text-slate-400";
    if (idx < 3) rankBadge = "text-emerald-400 font-bold";
    if (idx >= list.length - 3 && list.length > 5) rankBadge = "text-rose-400 font-bold";

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-3 font-semibold ${rankBadge}">#${idx + 1}</td>
        <td class="p-3 font-bold text-slate-100">${item.owner}</td>
        <td class="p-3 text-center font-mono text-slate-400">${item.games}</td>
        <td class="p-3 text-right font-mono text-emerald-400">${item.avgStart.toFixed(1)}</td>
        <td class="p-3 text-right font-mono text-slate-400">${item.avgBench.toFixed(1)}</td>
        <td class="p-3 text-right font-mono font-bold ${rankBadge}">${item.benchRatio.toFixed(1)}%</td>
      </tr>
    `;
  }).join('');
}

function renderPositions(rosterStats) {
  const tbody = document.getElementById('positions-body');
  if (!tbody) return;

  if (!rosterStats || rosterStats.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-500">No roster entries match this filter criteria.</td></tr>`;
    return;
  }

  const managerMap = {};
  rosterStats.forEach(r => {
    if (!managerMap[r.owner]) {
      managerMap[r.owner] = { owner: r.owner, qb: 0, rb: 0, wr: 0, te: 0, k_def: 0, total: 0, games: 0 };
    }
    managerMap[r.owner].qb += r.qb_pts;
    managerMap[r.owner].rb += r.rb_pts;
    managerMap[r.owner].wr += r.wr_pts;
    managerMap[r.owner].te += r.te_pts;
    managerMap[r.owner].k_def += r.k_def_pts;
    managerMap[r.owner].total += r.start_pts;
    managerMap[r.owner].games += 1;
  });

  const list = Object.values(managerMap)
    .filter(m => m.games > 0)
    .map(m => ({
      owner: m.owner,
      qb: m.qb / m.games,
      rb: m.rb / m.games,
      wr: m.wr / m.games,
      te: m.te / m.games,
      k_def: m.k_def / m.games,
      total: m.total / m.games
    }))
    .sort((a, b) => b.total - a.total);

  const maxQB = Math.max(...list.map(l => l.qb));
  const maxRB = Math.max(...list.map(l => l.rb));
  const maxWR = Math.max(...list.map(l => l.wr));
  const maxTE = Math.max(...list.map(l => l.te));
  const maxKDef = Math.max(...list.map(l => l.k_def));

  tbody.innerHTML = list.map(m => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-3 font-bold text-slate-100">${m.owner}</td>
      <td class="p-3 text-right font-mono ${m.qb === maxQB ? 'text-amber-400 font-bold' : 'text-slate-300'}">${m.qb.toFixed(1)}</td>
      <td class="p-3 text-right font-mono ${m.rb === maxRB ? 'text-amber-400 font-bold' : 'text-slate-300'}">${m.rb.toFixed(1)}</td>
      <td class="p-3 text-right font-mono ${m.wr === maxWR ? 'text-amber-400 font-bold' : 'text-slate-300'}">${m.wr.toFixed(1)}</td>
      <td class="p-3 text-right font-mono ${m.te === maxTE && maxTE > 0 ? 'text-amber-400 font-bold' : 'text-slate-300'}">${m.te.toFixed(1)}</td>
      <td class="p-3 text-right font-mono ${m.k_def === maxKDef ? 'text-amber-400 font-bold' : 'text-slate-400'}">${m.k_def.toFixed(1)}</td>
      <td class="p-3 text-right font-mono font-bold text-emerald-400">${m.total.toFixed(1)}</td>
    </tr>
  `).join('');
}

function runCustomQuery() {
  const selectedOwner = document.getElementById('query-team').value;
  const cond = document.getElementById('query-cond').value;
  const queryType = document.getElementById('query-type').value;
  const matches = getFilteredMatchups();

  const results = matches.filter(m => {
    if (selectedOwner !== 'all' && m.home_owner !== selectedOwner && m.away_owner !== selectedOwner) return false;
    if (queryType === 'regular' && m.matchup_type !== 'REGULAR') return false;
    if (queryType === 'playoff' && m.matchup_type !== 'PLAYOFF') return false;
    if (cond === 'gt150' && m.home_score < 150 && m.away_score < 150) return false;
    if (cond === 'lt90' && m.home_score >= 90 && m.away_score >= 90) return false;
    if (cond === 'margin5' && m.margin >= 5) return false;
    return true;
  });

  const tbody = document.getElementById('query-results-body');
  if (!results.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">No matching matchups found.</td></tr>`;
    return;
  }

  tbody.innerHTML = results.map(m => `
    <tr class="hover:bg-slate-800/40">
      <td class="p-2">${m.year}</td>
      <td class="p-2">Wk ${m.week}</td>
      <td class="p-2 font-medium">${m.home_owner} <span class="text-xs text-slate-400">(${m.home_team_name})</span></td>
      <td class="p-2 text-center font-mono font-bold">${m.home_score} - ${m.away_score}</td>
      <td class="p-2 font-medium">${m.away_owner} <span class="text-xs text-slate-400">(${m.away_team_name})</span></td>
      <td class="p-2 text-emerald-400 font-semibold">${m.winner_owner}</td>
      <td class="p-2 text-right font-mono">${m.margin.toFixed(2)}</td>
    </tr>
  `).join('');
}

function openLineupModal(yr, wk, owner) {
  const modal = document.getElementById('lineup-modal');
  const key = `${yr}_${wk}`;
  const lineupData = RAW_DATA.weekly_players?.[key]?.lineups?.[owner];

  if (!lineupData) {
    alert(`No lineup data found for ${owner} in Year ${yr}, Week ${wk}.`);
    return;
  }

  document.getElementById('modal-manager-name').innerText = owner;
  document.getElementById('modal-matchup-subtitle').innerText = `${yr} Season • Week ${wk} Lineup`;
  document.getElementById('modal-starter-pts').innerText = `Starters: ${lineupData.total_starter_pts.toFixed(1)} pts`;
  document.getElementById('modal-bench-pts').innerText = `Bench: ${lineupData.total_bench_pts.toFixed(1)} pts`;

  const slotOrder = { 'QB': 1, 'RB': 2, 'WR': 3, 'TE': 4, 'FLEX': 5, 'D/ST': 6, 'K': 7 };
  const sortedStarters = [...lineupData.starters].sort((a, b) => (slotOrder[a.slot] || 99) - (slotOrder[b.slot] || 99) || b.points - a.points);
  const sortedBench = [...lineupData.bench].sort((a, b) => b.points - a.points);

  const startersBody = document.getElementById('modal-starters-body');
  startersBody.innerHTML = sortedStarters.map(p => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-2 font-mono font-bold text-slate-400">${p.slot}</td>
      <td class="p-2 font-bold text-slate-100">${p.name}</td>
      <td class="p-2 font-mono text-slate-400">${p.pos}</td>
      <td class="p-2 text-right font-mono font-bold text-emerald-400">${p.points.toFixed(1)}</td>
    </tr>
  `).join('');

  const benchBody = document.getElementById('modal-bench-body');
  benchBody.innerHTML = sortedBench.map(p => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="p-2 font-mono font-bold text-slate-500">${p.slot}</td>
      <td class="p-2 font-bold text-slate-300">${p.name}</td>
      <td class="p-2 font-mono text-slate-500">${p.pos}</td>
      <td class="p-2 text-right font-mono font-bold text-amber-400">${p.points.toFixed(1)}</td>
    </tr>
  `).join('');

  modal.classList.remove('hidden');
}

function closeLineupModal() {
  const modal = document.getElementById('lineup-modal');
  if (modal) modal.classList.add('hidden');
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLineupModal();
});

document.addEventListener('click', (e) => {
  const modal = document.getElementById('lineup-modal');
  if (modal && !modal.classList.contains('hidden') && e.target === modal) {
    closeLineupModal();
  }
});