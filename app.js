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

const HUB_MAPPING = {
  standings: 'hub-btn-history',
  finishes: 'hub-btn-history',
  storylines: 'hub-btn-history',
  keepers: 'hub-btn-history',
  rivalry: 'hub-btn-rivalries',
  brackets: 'hub-btn-rivalries',
  h2h: 'hub-btn-rivalries',
  drafts: 'hub-btn-rosters',
  trades: 'hub-btn-rosters',
  dreamteam: 'hub-btn-rosters',
  positions: 'hub-btn-rosters',
  recap: 'hub-btn-weekly',
  badbeats: 'hub-btn-weekly',
  efficiency: 'hub-btn-weekly',
  records: 'hub-btn-weekly',
  simulator: 'hub-btn-tools',
  charts: 'hub-btn-tools',
  query: 'hub-btn-tools'
};

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
    initSimulatorControls();
    initDraftControls();
    initRivalryControls();
    initRecapControls();
    initChartControls();
    initKeeperControls();
    initStorylineControls();
    initBracketControls();
    initTradeControls();

    renderAll();
  } catch (err) {
    console.error("Could not load data.json:", err);
    const standingsBody = document.getElementById('standings-body');
    if (standingsBody) {
      standingsBody.innerHTML = `
        <tr><td colspan="9" class="p-6 text-center text-rose-400">
          Failed to load <code>data.json</code>. Ensure the local server is running: <code>python -m http.server 8000</code>.
        </td></tr>`;
    }
  }
});

// Dynamic Tab Switcher for the 5 Dropdown Hubs
function switchTab(tabId) {
  // 1. Hide all main sections
  document.querySelectorAll('main > section').forEach(sec => {
    sec.classList.add('hidden');
  });

  // 2. Un-highlight all sub-buttons
  document.querySelectorAll('.nav-sub-btn').forEach(btn => {
    btn.classList.remove('bg-slate-800', 'text-emerald-400');
    btn.classList.add('text-slate-300');
  });

  // 3. Reset all parent Hub buttons
  document.querySelectorAll('.hub-btn').forEach(btn => {
    btn.classList.remove('bg-slate-800', 'text-emerald-400', 'border-emerald-500/40');
    btn.classList.add('text-slate-300');
  });

  // 4. Show active section
  const activeView = document.getElementById(`view-${tabId}`);
  if (activeView) activeView.classList.remove('hidden');

  // 5. Highlight active sub-button
  const activeSubBtn = document.getElementById(`nav-${tabId}`);
  if (activeSubBtn) {
    activeSubBtn.classList.remove('text-slate-300');
    activeSubBtn.classList.add('bg-slate-800', 'text-emerald-400');
  }

  // 6. Highlight parent Hub button
  const parentHubId = HUB_MAPPING[tabId];
  if (parentHubId) {
    const parentBtn = document.getElementById(parentHubId);
    if (parentBtn) {
      parentBtn.classList.remove('text-slate-300');
      parentBtn.classList.add('bg-slate-800', 'text-emerald-400');
    }
  }

  // Force document focus drop to close mobile dropdowns
  if (document.activeElement) document.activeElement.blur();
}

function getManagerList() {
  if (RAW_DATA?.manager_profiles && Object.keys(RAW_DATA.manager_profiles).length > 0) {
    return Object.keys(RAW_DATA.manager_profiles).sort();
  }
  if (RAW_DATA?.matchups) {
    const set = new Set();
    RAW_DATA.matchups.forEach(m => {
      if (m.home_owner) set.add(m.home_owner);
      if (m.away_owner) set.add(m.away_owner);
    });
    return Array.from(set).sort();
  }
  return [];
}

function initControls() {
  const startYear = document.getElementById('startYear');
  const endYear = document.getElementById('endYear');
  const queryTeam = document.getElementById('query-team');

  if (!startYear || !endYear || !RAW_DATA?.years) return;

  startYear.innerHTML = '';
  endYear.innerHTML = '';
  if (queryTeam) queryTeam.innerHTML = '';

  RAW_DATA.years.forEach(yr => {
    startYear.add(new Option(yr, yr));
    endYear.add(new Option(yr, yr));
  });
  startYear.value = RAW_DATA.years[0];
  endYear.value = RAW_DATA.years[RAW_DATA.years.length - 1];

  if (queryTeam) {
    queryTeam.add(new Option("Any Manager", "all"));
    getManagerList().forEach(mName => {
      queryTeam.add(new Option(mName, mName));
    });
  }
}

function initSimulatorControls() {
  const seasonSelect = document.getElementById('sim-season-select');
  if (!seasonSelect || !RAW_DATA?.years) return;

  seasonSelect.innerHTML = '';
  RAW_DATA.years.slice().reverse().forEach(yr => {
    seasonSelect.add(new Option(`${yr} Season`, yr));
  });

  onSimSeasonChange();
}

function onSimSeasonChange() {
  const seasonSelect = document.getElementById('sim-season-select');
  const cutoffSelect = document.getElementById('sim-cutoff-select');
  if (!seasonSelect || !cutoffSelect || !RAW_DATA?.matchups) return;

  const yr = parseInt(seasonSelect.value);
  const regMatches = RAW_DATA.matchups.filter(m => m.year === yr && m.matchup_type === 'REGULAR');
  const weeks = [...new Set(regMatches.map(m => m.week))].sort((a, b) => a - b);
  const maxWeek = weeks.length > 0 ? weeks[weeks.length - 1] : 14;

  cutoffSelect.innerHTML = '';
  const defaultCutoff = Math.max(1, Math.min(maxWeek, 8));

  for (let w = 1; w <= maxWeek; w++) {
    const isCurrent = w === defaultCutoff;
    cutoffSelect.add(new Option(`After Week ${w} (${maxWeek - w} weeks remaining)`, w, isCurrent, isCurrent));
  }

  runMonteCarloSimulation();
}

function randomGaussian(mu, sigma) {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mu + z * sigma;
}

function runMonteCarloSimulation() {
  const seasonSelect = document.getElementById('sim-season-select');
  const cutoffSelect = document.getElementById('sim-cutoff-select');
  const iterSelect = document.getElementById('sim-iterations-select');
  const tbody = document.getElementById('sim-results-body');

  if (!seasonSelect || !cutoffSelect || !RAW_DATA?.matchups) return;

  const yr = parseInt(seasonSelect.value);
  const cutoffWeek = parseInt(cutoffSelect.value);
  const iterations = parseInt(iterSelect?.value || 10000);

  const regMatches = RAW_DATA.matchups.filter(m => m.year === yr && m.matchup_type === 'REGULAR');
  if (!regMatches.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">No regular season matchup data found for ${yr}.</td></tr>`;
    return;
  }

  const teams = {};
  regMatches.forEach(m => {
    [m.home_owner, m.away_owner].forEach(mgr => {
      if (!teams[mgr]) {
        teams[mgr] = {
          name: mgr,
          baselineWins: 0,
          baselineLosses: 0,
          baselineTies: 0,
          baselinePF: 0,
          scores: []
        };
      }
    });

    if (m.week <= cutoffWeek) {
      teams[m.home_owner].scores.push(m.home_score);
      teams[m.away_owner].scores.push(m.away_score);
      teams[m.home_owner].baselinePF += m.home_score;
      teams[m.away_owner].baselinePF += m.away_score;

      if (m.home_score > m.away_score) {
        teams[m.home_owner].baselineWins++;
        teams[m.away_owner].baselineLosses++;
      } else if (m.away_score > m.home_score) {
        teams[m.away_owner].baselineWins++;
        teams[m.home_owner].baselineLosses++;
      } else {
        teams[m.home_owner].baselineTies++;
        teams[m.away_owner].baselineTies++;
      }
    }
  });

  const managerProfiles = {};
  Object.values(teams).forEach(t => {
    const n = t.scores.length;
    const mean = n > 0 ? t.scores.reduce((a, b) => a + b, 0) / n : 110.0;
    const variance = n > 1 ? t.scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1) : 225.0;
    const sigma = Math.max(12.0, Math.sqrt(variance));

    managerProfiles[t.name] = { mean, sigma };
  });

  const remainingMatches = regMatches.filter(m => m.week > cutoffWeek);

  const simResults = {};
  Object.keys(teams).forEach(mgr => {
    simResults[mgr] = {
      name: mgr,
      seedCounts: Array(Object.keys(teams).length + 1).fill(0),
      totalSimWins: 0,
      totalSimLosses: 0,
      totalSimPF: 0,
      topSeedWins: 0,
      byeWins: 0,
      playoffWins: 0,
      toiletBowlWins: 0
    };
  });

  for (let iter = 0; iter < iterations; iter++) {
    const state = {};
    Object.keys(teams).forEach(mgr => {
      state[mgr] = {
        name: mgr,
        wins: teams[mgr].baselineWins,
        losses: teams[mgr].baselineLosses,
        ties: teams[mgr].baselineTies,
        pf: teams[mgr].baselinePF
      };
    });

    remainingMatches.forEach(m => {
      const hProf = managerProfiles[m.home_owner] || { mean: 110.0, sigma: 15.0 };
      const aProf = managerProfiles[m.away_owner] || { mean: 110.0, sigma: 15.0 };

      const hScore = Math.max(45.0, randomGaussian(hProf.mean, hProf.sigma));
      const aScore = Math.max(45.0, randomGaussian(aProf.mean, aProf.sigma));

      state[m.home_owner].pf += hScore;
      state[m.away_owner].pf += aScore;

      if (hScore > aScore) {
        state[m.home_owner].wins++;
        state[m.away_owner].losses++;
      } else if (aScore > hScore) {
        state[m.away_owner].wins++;
        state[m.home_owner].losses++;
      } else {
        state[m.home_owner].ties++;
        state[m.away_owner].ties++;
      }
    });

    const ranked = Object.values(state).sort((a, b) => {
      const aPct = (a.wins + a.ties * 0.5);
      const bPct = (b.wins + b.ties * 0.5);
      return bPct - aPct || b.pf - a.pf;
    });

    ranked.forEach((r, rankIdx) => {
      const seed = rankIdx + 1;
      const res = simResults[r.name];
      res.seedCounts[seed]++;
      res.totalSimWins += r.wins;
      res.totalSimLosses += r.losses;
      res.totalSimPF += r.pf;

      if (seed === 1) res.topSeedWins++;
      if (seed <= 2) res.byeWins++;
      if (seed <= 6) res.playoffWins++;
      if (seed >= 7) res.toiletBowlWins++;
    });
  }

  const finalLeaderboard = Object.values(simResults).map(r => {
    const makePlayoffPct = (r.playoffWins / iterations) * 100;
    const byePct = (r.byeWins / iterations) * 100;
    const topSeedPct = (r.topSeedWins / iterations) * 100;
    const toiletPct = (r.toiletBowlWins / iterations) * 100;
    const avgWins = (r.totalSimWins / iterations).toFixed(1);
    const avgLosses = (r.totalSimLosses / iterations).toFixed(1);
    const avgPF = (r.totalSimPF / iterations).toFixed(1);

    return {
      ...r,
      base: teams[r.name],
      makePlayoffPct,
      byePct,
      topSeedPct,
      toiletPct,
      avgWins,
      avgLosses,
      avgPF
    };
  }).sort((a, b) => b.makePlayoffPct - a.makePlayoffPct || b.avgWins - a.avgWins || b.avgPF - a.avgPF);

  const topSeed = [...finalLeaderboard].sort((a, b) => b.topSeedPct - a.topSeedPct)[0];
  if (topSeed) {
    document.getElementById('sim-top-seed-name').innerText = topSeed.name;
    document.getElementById('sim-top-seed-desc').innerText = `${topSeed.topSeedPct.toFixed(1)}% chance to clinch regular season crown`;
  }

  const locks = finalLeaderboard.filter(t => t.makePlayoffPct >= 99.0);
  if (locks.length > 0) {
    document.getElementById('sim-locks-list').innerText = locks.map(l => l.name).join(', ');
  } else {
    document.getElementById('sim-locks-list').innerText = "Wide Open Race";
  }

  const bubble = finalLeaderboard.filter(t => t.makePlayoffPct >= 20.0 && t.makePlayoffPct <= 80.0);
  if (bubble.length > 0) {
    document.getElementById('sim-bubble-list').innerText = bubble.map(b => `${b.name} (${b.makePlayoffPct.toFixed(0)}%)`).join(', ');
    document.getElementById('sim-bubble-desc').innerText = `${bubble.length} teams fighting for final playoff seeds`;
  } else {
    document.getElementById('sim-bubble-list').innerText = "Clear Standings Cutoffs";
    document.getElementById('sim-bubble-desc').innerText = "--";
  }

  if (tbody) {
    tbody.innerHTML = finalLeaderboard.map((t, idx) => {
      const safeMgr = t.name.replace(/'/g, "\\'");
      const isClinched = t.makePlayoffPct >= 99.0;
      const isEliminated = t.makePlayoffPct <= 1.0;

      let barColor = "from-emerald-500 to-teal-400";
      if (t.makePlayoffPct < 35.0) barColor = "from-rose-500 to-amber-500";
      else if (t.makePlayoffPct < 70.0) barColor = "from-amber-500 to-emerald-400";

      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="p-3 font-mono font-bold ${idx < 2 ? 'text-cyan-400' : (idx < 6 ? 'text-emerald-400' : 'text-slate-500')}">#${idx + 1}</td>
          <td class="p-3">
            <button onclick="openManagerDossier('${safeMgr}')" class="font-bold text-slate-100 hover:text-emerald-400 text-left transition flex items-center gap-1.5">
              <span>${t.name}</span>
              ${isClinched ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">LOCK</span>' : ''}
              ${isEliminated ? '<span class="text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1.5 py-0.2 rounded font-mono">ELIM</span>' : ''}
            </button>
          </td>
          <td class="p-3 text-center font-mono text-slate-400">${t.base.baselineWins}-${t.base.baselineLosses}${t.base.baselineTies > 0 ? `-${t.base.baselineTies}` : ''}</td>
          <td class="p-3 text-center font-mono font-bold text-white">${t.avgWins}-${t.avgLosses}</td>
          <td class="p-3 text-right font-mono text-slate-300">${t.avgPF}</td>
          <td class="p-3 text-center font-mono font-bold ${t.topSeedPct > 0 ? 'text-amber-400' : 'text-slate-600'}">${t.topSeedPct.toFixed(1)}%</td>
          <td class="p-3 text-center font-mono font-bold ${t.byePct > 0 ? 'text-cyan-400' : 'text-slate-600'}">${t.byePct.toFixed(1)}%</td>
          <td class="p-3">
            <div class="flex items-center gap-2">
              <span class="font-mono font-black text-xs min-w-[42px] ${t.makePlayoffPct >= 50 ? 'text-emerald-400' : 'text-slate-400'}">${t.makePlayoffPct.toFixed(1)}%</span>
              <div class="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700">
                <div class="bg-gradient-to-r ${barColor} h-full rounded-full transition-all duration-500" style="width: ${t.makePlayoffPct}%"></div>
              </div>
            </div>
          </td>
          <td class="p-3 text-center font-mono font-bold ${t.toiletPct > 50 ? 'text-rose-400' : 'text-slate-500'}">${t.toiletPct.toFixed(1)}%</td>
        </tr>
      `;
    }).join('');
  }
}

function initDraftControls() {
  const select = document.getElementById('draft-year-select');
  if (!select || !RAW_DATA?.years) return;

  select.innerHTML = '';
  RAW_DATA.years.slice().reverse().forEach(yr => {
    select.add(new Option(`${yr} Draft Board`, yr));
  });
}

function renderDraftVault() {
  const draftData = RAW_DATA?.draft_vault;
  if (!draftData) return;

  const topSteal = draftData.steals?.[0];
  if (topSteal) {
    document.getElementById('draft-top-steal-name').innerText = `${topSteal.player} (${topSteal.pos})`;
    document.getElementById('draft-top-steal-desc').innerText = `Pick #${topSteal.overall_pick} (Rd ${topSteal.round_num}) by ${topSteal.owner} -> ${topSteal.starter_pts.toFixed(1)} pts ('${String(topSteal.year).slice(-2)})`;
  }

  const topBust = draftData.busts?.[0];
  if (topBust) {
    document.getElementById('draft-top-bust-name').innerText = `${topBust.player} (${topBust.pos})`;
    document.getElementById('draft-top-bust-desc').innerText = `Pick #${topBust.overall_pick} (Rd ${topBust.round_num}) by ${topBust.owner} -> only ${topBust.starter_pts.toFixed(1)} pts ('${String(topBust.year).slice(-2)})`;
  }

  const topGM = draftData.manager_draft_roi?.[0];
  if (topGM) {
    document.getElementById('draft-top-gm-name').innerText = topGM.manager;
    document.getElementById('draft-top-gm-desc').innerText = `${topGM.hit_rate}% Draft Hit Rate (${topGM.avg_pts_per_pick} Avg Starter Pts / Pick)`;
  }

  const mgrTbody = document.getElementById('draft-manager-roi-body');
  if (mgrTbody && draftData.manager_draft_roi) {
    mgrTbody.innerHTML = draftData.manager_draft_roi.map((m, idx) => {
      const safeMgr = m.manager.replace(/'/g, "\\'");
      const stealDesc = m.best_steal ? `${m.best_steal.player} (Rd ${m.best_steal.round_num}, ${m.best_steal.starter_pts.toFixed(0)} pts)` : '--';

      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="p-2.5 font-bold text-slate-500">#${idx + 1}</td>
          <td class="p-2.5">
            <button onclick="openManagerDossier('${safeMgr}')" class="font-bold text-slate-100 hover:text-emerald-400 text-left transition">
              ${m.manager}
            </button>
          </td>
          <td class="p-2.5 text-center font-mono text-slate-400">${m.total_picks}</td>
          <td class="p-2.5 text-center font-mono font-bold ${m.hit_rate >= 50 ? 'text-emerald-400 bg-emerald-500/10 rounded' : 'text-slate-300'}">${m.hit_rate}%</td>
          <td class="p-2.5 text-center font-mono font-bold ${m.early_hit_rate >= 70 ? 'text-cyan-400' : 'text-slate-400'}">${m.early_hit_rate}%</td>
          <td class="p-2.5 text-right font-mono font-bold text-white">${m.avg_pts_per_pick} pts</td>
          <td class="p-2.5 text-xs text-slate-400 truncate max-w-[220px]" title="${stealDesc}">${stealDesc}</td>
        </tr>
      `;
    }).join('');
  }

  const stealsTbody = document.getElementById('draft-steals-table-body');
  if (stealsTbody && draftData.steals) {
    stealsTbody.innerHTML = draftData.steals.slice(0, 15).map(s => `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-2 font-mono text-slate-400">#${s.overall_pick} <span class="text-slate-500">(R${s.round_num})</span></td>
        <td class="p-2 font-bold text-white">${s.player} <span class="text-[10px] text-slate-500 font-mono">${s.pos}</span></td>
        <td class="p-2 text-slate-300">${s.owner}</td>
        <td class="p-2 text-center font-mono text-slate-400">'${String(s.year).slice(-2)}</td>
        <td class="p-2 text-right font-mono font-bold text-emerald-400">${s.starter_pts.toFixed(1)}</td>
      </tr>
    `).join('');
  }

  const bustsTbody = document.getElementById('draft-busts-table-body');
  if (bustsTbody && draftData.busts) {
    bustsTbody.innerHTML = draftData.busts.slice(0, 15).map(b => `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-2 font-mono text-slate-400">#${b.overall_pick} <span class="text-slate-500">(R${b.round_num})</span></td>
        <td class="p-2 font-bold text-slate-200">${b.player} <span class="text-[10px] text-slate-500 font-mono">${b.pos}</span></td>
        <td class="p-2 text-slate-400">${b.owner}</td>
        <td class="p-2 text-center font-mono text-slate-400">'${String(b.year).slice(-2)}</td>
        <td class="p-2 text-right font-mono font-bold text-rose-400">${b.starter_pts.toFixed(1)}</td>
      </tr>
    `).join('');
  }

  renderSeasonDraftBoard();
}

function renderSeasonDraftBoard() {
  const yrSelect = document.getElementById('draft-year-select');
  const roundFilter = document.getElementById('draft-round-filter')?.value || 'ALL';
  const tbody = document.getElementById('draft-board-table-body');

  if (!yrSelect || !tbody || !RAW_DATA?.draft_vault?.drafts_by_season) return;

  const yr = parseInt(yrSelect.value);
  const picks = RAW_DATA.draft_vault.drafts_by_season[yr] || [];

  const filtered = picks.filter(p => {
    if (roundFilter === 'ALL') return true;
    if (roundFilter === '1') return p.round_num === 1;
    if (roundFilter === '2') return p.round_num === 2;
    if (roundFilter === '3') return p.round_num === 3;
    if (roundFilter === 'LATE') return p.round_num >= 8;
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-500">No draft records found for ${yr}.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const isSteal = p.has_played && p.round_num >= 6 && p.starter_pts >= 120.0;
    const isBust = p.has_played && p.round_num <= 2 && p.starter_pts < 60.0 && p.starts <= 4;
    const safeMgr = p.owner.replace(/'/g, "\\'");

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-3 font-mono font-bold text-slate-400">#${p.overall_pick}</td>
        <td class="p-3 font-mono text-slate-500">R${p.round_num} (Pk ${p.round_pick})</td>
        <td class="p-3">
          <div class="font-bold text-white flex items-center gap-1.5">
            <span>${p.player}</span>
            ${isSteal ? '<span class="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono">STEAL</span>' : ''}
            ${isBust ? '<span class="text-[10px] bg-rose-500/20 text-rose-400 border border-rose-500/30 px-1.5 py-0.2 rounded font-mono">BUST</span>' : ''}
          </div>
        </td>
        <td class="p-3 font-mono text-xs text-slate-400">${p.pos}</td>
        <td class="p-3">
          <button onclick="openManagerDossier('${safeMgr}')" class="font-semibold text-slate-200 hover:text-emerald-400 text-left transition">
            ${p.owner}
          </button>
        </td>
        <td class="p-3 text-center font-mono text-slate-400">${p.starts}</td>
        <td class="p-3 text-right font-mono font-bold ${p.starter_pts >= 100 ? 'text-emerald-400' : 'text-slate-300'}">${p.starter_pts.toFixed(1)}</td>
        <td class="p-3 text-right font-mono text-slate-400">${p.total_pts.toFixed(1)}</td>
      </tr>
    `;
  }).join('');
}

function initRivalryControls() {
  const m1 = document.getElementById('rivalry-mgr1');
  const m2 = document.getElementById('rivalry-mgr2');
  if (!m1 || !m2 || !RAW_DATA) return;

  const managers = getManagerList();
  m1.innerHTML = '';
  m2.innerHTML = '';

  managers.forEach(name => {
    m1.add(new Option(name, name));
    m2.add(new Option(name, name));
  });

  if (managers.length > 1) {
    m1.value = managers[0];
    m2.value = managers[1];
  } else if (managers.length === 1) {
    m1.value = managers[0];
    m2.value = managers[0];
  }
}

function renderRivalry() {
  const m1Select = document.getElementById('rivalry-mgr1');
  const m2Select = document.getElementById('rivalry-mgr2');
  if (!m1Select || !m2Select || !RAW_DATA) return;

  const m1 = m1Select.value;
  const m2 = m2Select.value;
  const gameLogContainer = document.getElementById('rivalry-gamelog-list');

  if (!m1 || !m2 || m1 === m2) {
    if (gameLogContainer) {
      gameLogContainer.innerHTML = `
        <div class="p-8 text-center text-slate-500 bg-slate-950/60 border border-slate-800 rounded-xl">
          ${(!m1 || !m2) ? 'Select two managers to view their head-to-head rivalry.' : 'Please select two different managers to compare.'}
        </div>`;
    }
    return;
  }

  const allMatches = getFilteredMatchups();
  const seriesMatches = allMatches.filter(m => {
    return (m.home_owner === m1 && m.away_owner === m2) || (m.home_owner === m2 && m.away_owner === m1);
  }).sort((a, b) => a.year - b.year || a.week - b.week);

  document.getElementById('rivalry-total-meetings-count').innerText = `${seriesMatches.length} Total Matches`;

  let m1Wins = 0, m2Wins = 0, ties = 0;
  let m1TotalPts = 0, m2TotalPts = 0;
  let m1RegWins = 0, m2RegWins = 0;
  let m1PlayoffWins = 0, m2PlayoffWins = 0;

  let maxMarginMatch = null, minMarginMatch = null, maxCombinedMatch = null;
  let maxMargin = -1, minMargin = 999, maxCombinedPts = -1;

  seriesMatches.forEach(m => {
    const isM1Home = m.home_owner === m1;
    const m1Score = isM1Home ? m.home_score : m.away_score;
    const m2Score = isM1Home ? m.away_score : m.home_score;
    const combined = m1Score + m2Score;

    m1TotalPts += m1Score;
    m2TotalPts += m2Score;

    if (m1Score > m2Score) {
      m1Wins++;
      if (m.matchup_type === 'REGULAR') m1RegWins++;
      if (m.matchup_type === 'PLAYOFF') m1PlayoffWins++;
    } else if (m2Score > m1Score) {
      m2Wins++;
      if (m.matchup_type === 'REGULAR') m2RegWins++;
      if (m.matchup_type === 'PLAYOFF') m2PlayoffWins++;
    } else {
      ties++;
    }

    if (m.margin > maxMargin) {
      maxMargin = m.margin;
      maxMarginMatch = m;
    }
    if (m.margin > 0 && m.margin < minMargin) {
      minMargin = m.margin;
      minMarginMatch = m;
    }
    if (combined > maxCombinedPts) {
      maxCombinedPts = combined;
      maxCombinedMatch = m;
    }
  });

  const totalGames = seriesMatches.length;
  const m1WinPct = totalGames > 0 ? ((m1Wins + ties * 0.5) / totalGames).toFixed(3) : '.000';
  const m2WinPct = totalGames > 0 ? ((m2Wins + ties * 0.5) / totalGames).toFixed(3) : '.000';
  const m1PPG = totalGames > 0 ? (m1TotalPts / totalGames).toFixed(1) : '0.0';
  const m2PPG = totalGames > 0 ? (m2TotalPts / totalGames).toFixed(1) : '0.0';

  let streakType = null, streakCount = 0;
  if (seriesMatches.length > 0) {
    const lastWinner = seriesMatches[seriesMatches.length - 1].winner_owner;
    if (lastWinner === m1 || lastWinner === m2) {
      streakType = lastWinner;
      for (let i = seriesMatches.length - 1; i >= 0; i--) {
        if (seriesMatches[i].winner_owner === lastWinner) streakCount++;
        else break;
      }
    }
  }

  const streakBadge = document.getElementById('rivalry-active-streak-badge');
  if (streakBadge) {
    if (streakCount > 0) {
      const color = streakType === m1 ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' : 'text-rose-400 bg-rose-500/10 border-rose-500/20';
      streakBadge.className = `text-xs font-mono font-bold px-2.5 py-0.5 rounded border ${color}`;
      streakBadge.innerText = `🔥 ${streakType} has won ${streakCount} in a row`;
    } else {
      streakBadge.className = `text-xs font-mono text-slate-500 bg-slate-800 border-slate-700 px-2 py-0.5 rounded border`;
      streakBadge.innerText = `No Active Streak`;
    }
  }

  document.getElementById('rivalry-m1-record').innerText = `${m1Wins}-${m2Wins}-${ties}`;
  document.getElementById('rivalry-m2-record').innerText = `${m2Wins}-${m1Wins}-${ties}`;
  document.getElementById('rivalry-m1-winpct').innerText = `${(m1WinPct * 100).toFixed(1)}%`;
  document.getElementById('rivalry-m2-winpct').innerText = `${(m2WinPct * 100).toFixed(1)}%`;
  document.getElementById('rivalry-m1-totalpts').innerText = `${m1TotalPts.toFixed(1)} pts`;
  document.getElementById('rivalry-m2-totalpts').innerText = `${m2TotalPts.toFixed(1)} pts`;
  document.getElementById('rivalry-m1-ppg').innerText = `${m1PPG} PPG`;
  document.getElementById('rivalry-m2-ppg').innerText = `${m2PPG} PPG`;
  document.getElementById('rivalry-m1-reg').innerText = `${m1RegWins} Wins`;
  document.getElementById('rivalry-m2-reg').innerText = `${m2RegWins} Wins`;
  document.getElementById('rivalry-m1-playoffs').innerText = `${m1PlayoffWins} Wins`;
  document.getElementById('rivalry-m2-playoffs').innerText = `${m2PlayoffWins} Wins`;

  if (maxMarginMatch) {
    document.getElementById('rivalry-sup-blowout-match').innerText = `${maxMarginMatch.winner_owner} (+${maxMarginMatch.margin.toFixed(1)} pts)`;
    document.getElementById('rivalry-sup-blowout-desc').innerText = `${maxMarginMatch.home_score.toFixed(1)} - ${maxMarginMatch.away_score.toFixed(1)} ('${String(maxMarginMatch.year).slice(-2)} Wk ${maxMarginMatch.week})`;
  }
  if (minMarginMatch) {
    document.getElementById('rivalry-sup-closest-match').innerText = `${minMarginMatch.winner_owner} def. ${minMarginMatch.winner_owner === minMarginMatch.home_owner ? minMarginMatch.away_owner : minMarginMatch.home_owner}`;
    document.getElementById('rivalry-sup-closest-desc').innerText = `+${minMarginMatch.margin.toFixed(2)} pts margin ('${String(minMarginMatch.year).slice(-2)} Wk ${minMarginMatch.week})`;
  }
  if (maxCombinedMatch) {
    document.getElementById('rivalry-sup-high-score').innerText = `${maxCombinedPts.toFixed(1)} Combined Pts`;
    document.getElementById('rivalry-sup-high-desc').innerText = `${maxCombinedMatch.home_owner} (${maxCombinedMatch.home_score.toFixed(1)}) vs ${maxCombinedMatch.away_owner} (${maxCombinedMatch.away_score.toFixed(1)}) in '${String(maxCombinedMatch.year).slice(-2)} Wk ${maxCombinedMatch.week}`;
  }

  if (!seriesMatches.length) {
    gameLogContainer.innerHTML = `<div class="p-6 text-center text-slate-500">No head-to-head games found between ${m1} and ${m2} for the current filter.</div>`;
    return;
  }

  gameLogContainer.innerHTML = [...seriesMatches].reverse().map(m => {
    const isM1Home = m.home_owner === m1;
    const m1Score = isM1Home ? m.home_score : m.away_score;
    const m2Score = isM1Home ? m.away_score : m.home_score;
    const m1Won = m1Score > m2Score;
    const m2Won = m2Score > m1Score;

    const safeHome = m.home_owner.replace(/'/g, "\\'");
    const safeAway = m.away_owner.replace(/'/g, "\\'");

    const typeBadge = m.matchup_type === 'PLAYOFF'
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">🏆 PLAYOFFS</span>`
      : m.matchup_type === 'CONSOLATION'
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">TOILET BOWL</span>`
      : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-500 border border-slate-700/60">REGULAR</span>`;

    return `
      <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 hover:border-slate-700 transition">
        <div class="flex items-center gap-2">
          <span class="font-mono text-xs text-slate-400 font-bold bg-slate-900 px-2 py-1 rounded border border-slate-800">${m.year} Wk ${m.week}</span>
          ${typeBadge}
        </div>

        <div class="flex items-center justify-center gap-3 flex-1">
          <button onclick="openLineupModal(${m.year}, ${m.week}, '${isM1Home ? safeHome : safeAway}')" class="text-right group focus:outline-none flex-1 truncate">
            <span class="text-xs font-bold ${m1Won ? 'text-cyan-400' : 'text-slate-300'} group-hover:text-cyan-300 transition">${m1}</span>
            <div class="text-[10px] text-slate-500 truncate">${isM1Home ? m.home_team_name : m.away_team_name}</div>
          </button>

          <div class="px-3 py-1 bg-slate-900 rounded-lg border border-slate-800 font-mono text-xs font-bold whitespace-nowrap shadow-inner">
            <span class="${m1Won ? 'text-cyan-400' : 'text-slate-400'}">${m1Score.toFixed(1)}</span>
            <span class="text-slate-600 px-1">-</span>
            <span class="${m2Won ? 'text-rose-400' : 'text-slate-400'}">${m2Score.toFixed(1)}</span>
          </div>

          <button onclick="openLineupModal(${m.year}, ${m.week}, '${!isM1Home ? safeHome : safeAway}')" class="text-left group focus:outline-none flex-1 truncate">
            <span class="text-xs font-bold ${m2Won ? 'text-rose-400' : 'text-slate-300'} group-hover:text-rose-300 transition">${m2}</span>
            <div class="text-[10px] text-slate-500 truncate">${!isM1Home ? m.home_team_name : m.away_team_name}</div>
          </button>
        </div>

        <div class="text-right text-[11px] font-mono text-slate-400 whitespace-nowrap">
          <strong class="${m1Won ? 'text-cyan-400' : 'text-rose-400'}">${m.winner_owner}</strong> +${m.margin.toFixed(1)}
        </div>
      </div>
    `;
  }).join('');
}

function initRecapControls() {
  const recapYear = document.getElementById('recapYear');
  if (!recapYear || !RAW_DATA?.years) return;

  recapYear.innerHTML = '';
  RAW_DATA.years.slice().reverse().forEach(yr => {
    recapYear.add(new Option(yr, yr));
  });

  onRecapYearChange();
}

function initChartControls() {
  const select = document.getElementById('chartSeasonSelect');
  if (!select || !RAW_DATA?.years) return;

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
  getManagerList().forEach(mName => {
    select.add(new Option(mName, mName));
  });
}

function initStorylineControls() {
  const select = document.getElementById('narrativeSeasonSelect');
  if (!select || !RAW_DATA?.years) return;

  select.innerHTML = '';
  RAW_DATA.years.slice().reverse().forEach(yr => {
    select.add(new Option(`${yr} Season`, yr));
  });
}

function initBracketControls() {
  const select = document.getElementById('bracketYearSelect');
  if (!select || !RAW_DATA?.years) return;

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
  getManagerList().forEach(mName => {
    select.add(new Option(mName, mName));
  });
}

function onRecapYearChange() {
  const recapYear = parseInt(document.getElementById('recapYear').value);
  const recapWeek = document.getElementById('recapWeek');
  if (!recapWeek || !RAW_DATA?.matchups) return;

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

function setBracketMode(mode) {
  currentBracketMode = mode;
  const btnChamp = document.getElementById('btn-bracket-champ');
  const btnConsol = document.getElementById('btn-bracket-consol');

  if (btnChamp && btnConsol) {
    if (mode === 'championship') {
      btnChamp.className = 'px-3 py-1 text-xs font-bold rounded bg-emerald-600 text-white transition';
      btnConsol.className = 'px-3 py-1 text-xs font-bold rounded text-slate-400 hover:text-white transition';
    } else {
      btnConsol.className = 'px-3 py-1 text-xs font-bold rounded bg-amber-600 text-white transition';
      btnChamp.className = 'px-3 py-1 text-xs font-bold rounded text-slate-400 hover:text-white transition';
    }
  }
  renderBrackets();
}

function getFilteredMatchups() {
  if (!RAW_DATA?.matchups) return [];
  const minYr = parseInt(document.getElementById('startYear')?.value || 0);
  const maxYr = parseInt(document.getElementById('endYear')?.value || 9999);
  const gameType = document.getElementById('gameType')?.value || 'all';

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
  if (!RAW_DATA?.roster_stats) return [];
  const minYr = parseInt(document.getElementById('startYear')?.value || 0);
  const maxYr = parseInt(document.getElementById('endYear')?.value || 9999);
  const gameType = document.getElementById('gameType')?.value || 'all';

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
  if (!RAW_DATA?.teams_history) return [];
  const minYr = parseInt(document.getElementById('startYear')?.value || 0);
  const maxYr = parseInt(document.getElementById('endYear')?.value || 9999);
  return RAW_DATA.teams_history.filter(t => t.year >= minYr && t.year <= maxYr);
}

function getFilteredGooseEggs() {
  if (!RAW_DATA?.goose_eggs) return [];
  const minYr = parseInt(document.getElementById('startYear')?.value || 0);
  const maxYr = parseInt(document.getElementById('endYear')?.value || 9999);
  const gameType = document.getElementById('gameType')?.value || 'all';

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
  if (!RAW_DATA?.player_seasons) return [];
  const minYr = parseInt(document.getElementById('startYear')?.value || 0);
  const maxYr = parseInt(document.getElementById('endYear')?.value || 9999);
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
  runMonteCarloSimulation();
  renderDraftVault();
  renderRivalry();
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
  const totalGamesEl = document.getElementById('stat-total-games');
  if (!totalGamesEl) return;
  totalGamesEl.innerText = matches.length;

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
  const tbody = document.getElementById('standings-body');
  if (!tbody || !RAW_DATA) return;

  const stats = {};
  getManagerList().forEach(name => {
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

  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">No matchups found for this filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map((s, idx) => {
    const prof = RAW_DATA.manager_profiles?.[s.manager] || { latest_team_name: s.manager, all_aliases: [] };
    const winPct = (s.wins / s.games).toFixed(3);
    const ppg = (s.pf / s.games).toFixed(1);
    const totalAllPlay = s.expWins + s.expLosses;
    const normExp = totalAllPlay > 0 ? (s.expWins / (totalAllPlay / s.games)).toFixed(1) : 0;
    const luck = (s.wins - normExp).toFixed(1);
    const luckColor = luck > 0 ? 'text-emerald-400' : luck < 0 ? 'text-rose-400' : 'text-slate-400';
    const safeMgr = s.manager.replace(/'/g, "\\'");

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-3 font-semibold text-slate-500">#${idx + 1}</td>
        <td class="p-3">
          <button onclick="openManagerDossier('${safeMgr}')" class="text-left group focus:outline-none block">
            <div class="font-bold text-slate-100 group-hover:text-emerald-400 flex items-center gap-1.5 transition">
              <span>${s.manager}</span>
              <span class="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition">🔍</span>
            </div>
            <div class="text-xs text-slate-400 truncate max-w-[280px]" title="${prof.all_aliases.join(' • ')}">
              ${prof.all_aliases.join(' • ')}
            </div>
          </button>
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

function openManagerDossier(mgrName) {
  const modal = document.getElementById('manager-dossier-modal');
  if (!modal || !RAW_DATA) return;

  const prof = RAW_DATA.manager_profiles?.[mgrName] || { latest_team_name: mgrName, all_aliases: [], years_active: [] };
  const allMatches = RAW_DATA.matchups || [];
  const teamsHistory = (RAW_DATA.teams_history || []).filter(t => t.owner_name === mgrName);

  document.getElementById('dossier-mgr-name').innerText = mgrName;
  document.getElementById('dossier-aliases-list').innerText = prof.all_aliases.length > 0 
    ? `Franchise Aliases: ${prof.all_aliases.join(' • ')}`
    : `Latest: ${prof.latest_team_name}`;

  let gold = 0, silver = 0, bronze = 0;
  teamsHistory.forEach(t => {
    if (t.final_standing === 1) gold++;
    else if (t.final_standing === 2) silver++;
    else if (t.final_standing === 3) bronze++;
  });

  document.getElementById('dossier-podium-badges').innerHTML = `
    <span class="text-amber-400 font-bold">🥇 ${gold}</span>
    <span class="text-slate-500 mx-0.5">|</span>
    <span class="text-slate-300 font-bold">🥈 ${silver}</span>
    <span class="text-slate-500 mx-0.5">|</span>
    <span class="text-amber-600 font-bold">🥉 ${bronze}</span>
  `;

  let wins = 0, losses = 0, ties = 0, pf = 0, games = 0;
  const oppMap = {};

  allMatches.forEach(m => {
    const isHome = m.home_owner === mgrName;
    const isAway = m.away_owner === mgrName;
    if (!isHome && !isAway) return;

    games++;
    const myScore = isHome ? m.home_score : m.away_score;
    const oppScore = isHome ? m.away_score : m.home_score;
    const opp = isHome ? m.away_owner : m.home_owner;

    pf += myScore;

    if (!oppMap[opp]) oppMap[opp] = { opp, wins: 0, losses: 0, ties: 0, games: 0 };
    oppMap[opp].games++;

    if (myScore > oppScore) {
      wins++;
      oppMap[opp].wins++;
    } else if (oppScore > myScore) {
      losses++;
      oppMap[opp].losses++;
    } else {
      ties++;
      oppMap[opp].ties++;
    }
  });

  const winPct = games > 0 ? (wins / games).toFixed(3) : '.000';
  const ppg = games > 0 ? (pf / games).toFixed(1) : '0.0';

  document.getElementById('dossier-stat-record').innerText = `${wins}-${losses}-${ties}`;
  document.getElementById('dossier-stat-winpct').innerText = `${(winPct * 100).toFixed(1)}% Win Rate`;
  document.getElementById('dossier-stat-pf').innerText = `${pf.toFixed(1)} PF`;
  document.getElementById('dossier-stat-ppg').innerText = `${ppg} PPG (${games} Gms)`;

  const streakInfo = RAW_DATA.streaks_data?.[mgrName] || { longest_win_streak: 0, longest_loss_streak: 0 };
  document.getElementById('dossier-stat-win-streak').innerText = `${streakInfo.longest_win_streak}W Streak`;
  document.getElementById('dossier-stat-loss-streak').innerText = `${streakInfo.longest_loss_streak}L Skid`;

  const oppList = Object.values(oppMap).filter(o => o.games >= 2);
  
  if (oppList.length > 0) {
    const nemesis = [...oppList].sort((a, b) => (a.wins / a.games) - (b.wins / b.games) || b.losses - a.losses)[0];
    const bunny = [...oppList].sort((a, b) => (b.wins / b.games) - (a.wins / a.games) || b.wins - a.wins)[0];

    document.getElementById('dossier-nemesis-name').innerText = nemesis.opp;
    document.getElementById('dossier-nemesis-desc').innerText = `${((nemesis.wins / nemesis.games) * 100).toFixed(0)}% Win Rate in ${nemesis.games} Meetings`;
    document.getElementById('dossier-nemesis-record').innerText = `${nemesis.wins}-${nemesis.losses}`;

    document.getElementById('dossier-bunny-name').innerText = bunny.opp;
    document.getElementById('dossier-bunny-desc').innerText = `${((bunny.wins / bunny.games) * 100).toFixed(0)}% Win Rate in ${bunny.games} Meetings`;
    document.getElementById('dossier-bunny-record').innerText = `${bunny.wins}-${bunny.losses}`;
  } else {
    document.getElementById('dossier-nemesis-name').innerText = "None Yet";
    document.getElementById('dossier-nemesis-desc').innerText = "--";
    document.getElementById('dossier-nemesis-record').innerText = "-";
    document.getElementById('dossier-bunny-name').innerText = "None Yet";
    document.getElementById('dossier-bunny-desc').innerText = "--";
    document.getElementById('dossier-bunny-record').innerText = "-";
  }

  const managerCornerstones = (RAW_DATA.cornerstone_stats || [])
    .filter(c => c.owner === mgrName)
    .sort((a, b) => b.starter_pts - a.starter_pts)
    .slice(0, 4);

  const rushmoreGrid = document.getElementById('dossier-rushmore-grid');
  if (managerCornerstones.length > 0) {
    rushmoreGrid.innerHTML = managerCornerstones.map((p, idx) => `
      <div class="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-mono text-[10px] font-extrabold text-slate-500 uppercase">#${idx + 1} Pillar</span>
          <span class="text-[10px] font-mono font-bold bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800">${p.pos}</span>
        </div>
        <div>
          <div class="font-black text-sm text-white truncate">${p.player}</div>
          <div class="text-[10px] text-slate-400 font-mono mt-0.5">${p.seasons} Seasons (${p.years_display})</div>
        </div>
        <div class="pt-1.5 border-t border-slate-800/80 flex items-center justify-between font-mono text-xs">
          <span class="text-slate-500">${p.starter_games} Starts</span>
          <strong class="text-emerald-400">${p.starter_pts.toFixed(1)} pts</strong>
        </div>
      </div>
    `).join('');
  } else {
    rushmoreGrid.innerHTML = `<div class="col-span-full text-slate-500 text-xs py-3 text-center">No multi-season cornerstones recorded for ${mgrName}.</div>`;
  }

  const sortedHistory = [...teamsHistory].sort((a, b) => b.year - a.year);
  const seasonsBody = document.getElementById('dossier-seasons-body');

  seasonsBody.innerHTML = sortedHistory.map(t => {
    const yrMatches = allMatches.filter(m => m.year === t.year && m.matchup_type === 'REGULAR' && (m.home_owner === mgrName || m.away_owner === mgrName));
    let yWins = 0, yLosses = 0, yTies = 0, yPf = 0;

    yrMatches.forEach(m => {
      const isH = m.home_owner === mgrName;
      const s = isH ? m.home_score : m.away_score;
      const oppS = isH ? m.away_score : m.home_score;
      yPf += s;
      if (s > oppS) yWins++;
      else if (oppS > s) yLosses++;
      else yTies++;
    });

    let rankBadge = `<span class="font-mono font-bold text-slate-300">#${t.final_standing}</span>`;
    if (t.final_standing === 1) rankBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">🥇 Champion</span>`;
    else if (t.final_standing === 2) rankBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-500/20 text-slate-300 border border-slate-500/30">🥈 Runner-Up</span>`;
    else if (t.final_standing === 3) rankBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-700/20 text-amber-500 border border-amber-700/30">🥉 3rd Place</span>`;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-2.5 font-mono font-bold text-slate-300">'${String(t.year).slice(-2)}</td>
        <td class="p-2.5 font-bold text-white">${t.team_name}</td>
        <td class="p-2.5 text-center font-mono text-slate-300">${yWins}-${yLosses}${yTies > 0 ? `-${yTies}` : ''}</td>
        <td class="p-2.5 text-right font-mono text-emerald-400">${yPf > 0 ? yPf.toFixed(1) : '--'}</td>
        <td class="p-2.5 text-right">${rankBadge}</td>
      </tr>
    `;
  }).join('');

  modal.classList.remove('hidden');
}

function closeManagerDossier() {
  const modal = document.getElementById('manager-dossier-modal');
  if (modal) modal.classList.add('hidden');
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeLineupModal();
    closeManagerDossier();
  }
});

document.addEventListener('click', (e) => {
  const lineupModal = document.getElementById('lineup-modal');
  const dossierModal = document.getElementById('manager-dossier-modal');

  if (lineupModal && !lineupModal.classList.contains('hidden') && e.target === lineupModal) {
    closeLineupModal();
  }
  if (dossierModal && !dossierModal.classList.contains('hidden') && e.target === dossierModal) {
    closeManagerDossier();
  }
});