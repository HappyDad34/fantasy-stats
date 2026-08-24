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
    const res = await fetch(`data.json?t=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    RAW_DATA = await res.json();
  } catch (fetchErr) {
    console.error("Network error fetching data.json:", fetchErr);
    const standingsBody = document.getElementById('standings-body');
    if (standingsBody) {
      standingsBody.innerHTML = `
        <tr><td colspan="9" class="p-6 text-center text-rose-400">
          Failed to load <code>data.json</code> (HTTP Error). Verify the file exists on GitHub or local server.
        </td></tr>`;
    }
    return;
  }

  // Fallback synthesis if years array is missing or empty
  if (RAW_DATA && (!RAW_DATA.years || !RAW_DATA.years.length)) {
    const foundYears = new Set();
    (RAW_DATA.matchups || []).forEach(m => m.year && foundYears.add(m.year));
    (RAW_DATA.teams_history || []).forEach(t => t.year && foundYears.add(t.year));
    RAW_DATA.years = Array.from(foundYears).sort((a, b) => a - b);
  }

  // Set Chart.js Defaults if loaded
  if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';
    Chart.defaults.font.family = 'ui-sans-serif, system-ui, sans-serif';
  }

  // Initialize UI controls safely
  safeExecute("initControls", initControls);
  safeExecute("initSimulatorControls", initSimulatorControls);
  safeExecute("initDraftControls", initDraftControls);
  safeExecute("initRivalryControls", initRivalryControls);
  safeExecute("initRecapControls", initRecapControls);
  safeExecute("initChartControls", initChartControls);
  safeExecute("initKeeperControls", initKeeperControls);
  safeExecute("initStorylineControls", initStorylineControls);
  safeExecute("initBracketControls", initBracketControls);
  safeExecute("initTradeControls", initTradeControls);
  safeExecute("setupGlobalTableSort", setupGlobalTableSort);

  // Render all active views
  renderAll();

  // Activate default view
  switchTab('standings');
});

function safeExecute(label, fn) {
  try {
    fn();
  } catch (err) {
    console.warn(`[Vault] Non-fatal error in ${label}:`, err);
  }
}

// Dynamic Tab Switcher for the 5 Dropdown Hubs
function switchTab(tabId) {
  // Hide all sections in <main>
  document.querySelectorAll('main > section').forEach(sec => {
    sec.classList.add('hidden');
  });

  // Reset all sub-navigation buttons
  document.querySelectorAll('.nav-sub-btn').forEach(btn => {
    btn.classList.remove('bg-slate-800', 'text-emerald-400');
    btn.classList.add('text-slate-300');
  });

  // Reset all parent Hub buttons
  document.querySelectorAll('.hub-btn').forEach(btn => {
    btn.classList.remove('bg-slate-800', 'text-emerald-400');
    btn.classList.add('text-slate-300');
  });

  // Show active section
  const activeView = document.getElementById(`view-${tabId}`);
  if (activeView) activeView.classList.remove('hidden');

  // Highlight active sub-navigation item
  const activeSubBtn = document.getElementById(`nav-${tabId}`);
  if (activeSubBtn) {
    activeSubBtn.classList.remove('text-slate-300');
    activeSubBtn.classList.add('bg-slate-800', 'text-emerald-400');
  }

  // Highlight parent Hub button
  const parentHubId = HUB_MAPPING[tabId];
  if (parentHubId) {
    const parentBtn = document.getElementById(parentHubId);
    if (parentBtn) {
      parentBtn.classList.remove('text-slate-300');
      parentBtn.classList.add('bg-slate-800', 'text-emerald-400');
    }
  }

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

  if (!startYear || !endYear) return;

  const years = (RAW_DATA?.years && RAW_DATA.years.length > 0) 
    ? RAW_DATA.years 
    : [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

  startYear.innerHTML = '';
  endYear.innerHTML = '';
  if (queryTeam) queryTeam.innerHTML = '';

  years.forEach(yr => {
    startYear.add(new Option(yr, yr));
    endYear.add(new Option(yr, yr));
  });

  startYear.value = years[0];
  endYear.value = years[years.length - 1];

  if (queryTeam) {
    queryTeam.add(new Option("Any Manager", "all"));
    getManagerList().forEach(mName => {
      queryTeam.add(new Option(mName, mName));
    });
  }
}

// ----------------------------------------------------
// UNIVERSAL CLICKABLE COLUMN TABLE SORTER
// ----------------------------------------------------
function setupGlobalTableSort() {
  document.addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;

    const table = th.closest('table');
    const tbody = table?.querySelector('tbody');
    if (!table || !tbody) return;

    const thIndex = Array.from(th.parentNode.children).indexOf(th);
    const currentIsAsc = th.classList.contains('sort-asc');
    const newDirection = !currentIsAsc;

    th.parentNode.querySelectorAll('th').forEach(header => {
      header.classList.remove('sort-asc', 'sort-desc');
      const arrow = header.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = ' ↕';
    });

    th.classList.add(newDirection ? 'sort-asc' : 'sort-desc');
    let arrow = th.querySelector('.sort-arrow');
    if (!arrow) {
      arrow = document.createElement('span');
      arrow.className = 'sort-arrow ml-1 font-mono text-[10px] text-slate-400';
      th.appendChild(arrow);
    }
    arrow.textContent = newDirection ? ' ▲' : ' ▼';

    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.sort((rowA, rowB) => {
      const cellA = rowA.children[thIndex]?.innerText.trim() || '';
      const cellB = rowB.children[thIndex]?.innerText.trim() || '';

      const parseVal = (str) => {
        const clean = str.replace(/pts|%|\$|\+|#|,/gi, '').trim();

        if (clean.includes('-')) {
          const parts = clean.split('-').map(Number);
          if (!parts.some(isNaN)) {
            const total = parts.reduce((a, b) => a + b, 0);
            return total > 0 ? (parts[0] + (parts[2] || 0) * 0.5) / total : 0;
          }
        }

        const num = parseFloat(clean);
        return isNaN(num) ? str.toLowerCase() : num;
      };

      const valA = parseVal(cellA);
      const valB = parseVal(cellB);

      if (typeof valA === 'number' && typeof valB === 'number') {
        return newDirection ? valA - valB : valB - valA;
      }
      return newDirection 
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

    rows.forEach(r => tbody.appendChild(r));
  });
}

// ----------------------------------------------------
// MONTE CARLO PLAYOFF SIMULATOR
// ----------------------------------------------------
function initSimulatorControls() {
  const seasonSelect = document.getElementById('sim-season-select');
  if (!seasonSelect) return;

  const years = (RAW_DATA?.years && RAW_DATA.years.length > 0) ? RAW_DATA.years : [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  seasonSelect.innerHTML = '';
  years.slice().reverse().forEach(yr => {
    seasonSelect.add(new Option(`${yr} Season`, yr));
  });

  onSimSeasonChange();
}

function onSimSeasonChange() {
  const seasonSelect = document.getElementById('sim-season-select');
  const cutoffSelect = document.getElementById('sim-cutoff-select');
  if (!seasonSelect || !cutoffSelect || !RAW_DATA?.matchups) return;

  const yr = parseInt(seasonSelect.value);
  if (isNaN(yr)) return;

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

  if (isNaN(yr) || isNaN(cutoffWeek)) return;

  const regMatches = RAW_DATA.matchups.filter(m => m.year === yr && m.matchup_type === 'REGULAR');
  if (!regMatches.length) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-500">No regular season matchup data found for ${yr}.</td></tr>`;
    return;
  }

  const teams = {};
  regMatches.forEach(m => {
    [m.home_owner, m.away_owner].forEach(mgr => {
      if (mgr && !teams[mgr]) {
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

    if (m.week <= cutoffWeek && teams[m.home_owner] && teams[m.away_owner]) {
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
      if (!state[m.home_owner] || !state[m.away_owner]) return;

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
      if (!res) return;
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

  const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

  if (finalLeaderboard.length) {
    const topSeed = [...finalLeaderboard].sort((a, b) => b.topSeedPct - a.topSeedPct)[0];
    setInner('sim-top-seed-name', topSeed.name);
    setInner('sim-top-seed-desc', `${topSeed.topSeedPct.toFixed(1)}% chance to clinch regular season crown`);
  }

  const locks = finalLeaderboard.filter(t => t.makePlayoffPct >= 99.0);
  setInner('sim-locks-list', locks.length > 0 ? locks.map(l => l.name).join(', ') : "Wide Open Race");

  const bubble = finalLeaderboard.filter(t => t.makePlayoffPct >= 20.0 && t.makePlayoffPct <= 80.0);
  if (bubble.length > 0) {
    setInner('sim-bubble-list', bubble.map(b => `${b.name} (${b.makePlayoffPct.toFixed(0)}%)`).join(', '));
    setInner('sim-bubble-desc', `${bubble.length} teams fighting for final playoff seeds`);
  } else {
    setInner('sim-bubble-list', "Clear Standings Cutoffs");
    setInner('sim-bubble-desc', "--");
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

// ----------------------------------------------------
// DRAFT VAULT & DRAFT DAY ROI
// ----------------------------------------------------
function initDraftControls() {
  const select = document.getElementById('draft-year-select');
  if (!select) return;

  const years = (RAW_DATA?.years && RAW_DATA.years.length > 0) ? RAW_DATA.years : [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  select.innerHTML = '';
  years.slice().reverse().forEach(yr => {
    select.add(new Option(`${yr} Draft Board`, yr));
  });
}

function renderDraftVault() {
  const draftData = RAW_DATA?.draft_vault;
  if (!draftData) return;

  const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

  const topSteal = draftData.steals?.[0];
  if (topSteal) {
    setInner('draft-top-steal-name', `${topSteal.player} (${topSteal.pos})`);
    setInner('draft-top-steal-desc', `Pick #${topSteal.overall_pick} (Rd ${topSteal.round_num}) by ${topSteal.owner} -> ${topSteal.starter_pts.toFixed(1)} pts ('${String(topSteal.year).slice(-2)})`);
  }

  const topBust = draftData.busts?.[0];
  if (topBust) {
    setInner('draft-top-bust-name', `${topBust.player} (${topBust.pos})`);
    setInner('draft-top-bust-desc', `Pick #${topBust.overall_pick} (Rd ${topBust.round_num}) by ${topBust.owner} -> only ${topBust.starter_pts.toFixed(1)} pts ('${String(topBust.year).slice(-2)})`);
  }

  const topGM = draftData.manager_draft_roi?.[0];
  if (topGM) {
    setInner('draft-top-gm-name', topGM.manager);
    setInner('draft-top-gm-desc', `${topGM.hit_rate}% Draft Hit Rate (${topGM.avg_pts_per_pick} Avg Starter Pts / Pick)`);
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

  const roundMvpsBody = document.getElementById('draft-round-mvps-body');
  if (roundMvpsBody && draftData.round_mvps) {
    roundMvpsBody.innerHTML = draftData.round_mvps.map(m => {
      const safeMgr = m.owner.replace(/'/g, "\\'");
      return `
        <tr class="hover:bg-slate-800/40 transition">
          <td class="p-2.5 font-mono font-bold text-amber-400">Round ${m.round_num}</td>
          <td class="p-2.5 font-mono text-slate-400">#${m.overall_pick}</td>
          <td class="p-2.5 font-bold text-white">${m.player}</td>
          <td class="p-2.5 font-mono text-xs text-slate-400">${m.pos}</td>
          <td class="p-2.5 font-semibold text-slate-200">
            <button onclick="openManagerDossier('${safeMgr}')" class="hover:text-emerald-400 transition">${m.owner}</button>
          </td>
          <td class="p-2.5 text-center font-mono text-slate-400">${m.year}</td>
          <td class="p-2.5 text-right font-mono font-bold text-emerald-400">${m.starter_pts.toFixed(1)} pts</td>
        </tr>
      `;
    }).join('');
  }

  renderSeasonDraftBoard();
  renderDraftCurveChart();
}

function renderSeasonDraftBoard() {
  const yrSelect = document.getElementById('draft-year-select');
  const roundFilter = document.getElementById('draft-round-filter')?.value || 'ALL';
  const tbody = document.getElementById('draft-board-table-body');

  if (!yrSelect || !tbody || !RAW_DATA?.draft_vault?.drafts_by_season) return;

  const yr = parseInt(yrSelect.value);
  if (isNaN(yr)) return;

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

// ----------------------------------------------------
// TALE OF THE TAPE RIVALRY INSPECTOR
// ----------------------------------------------------
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

  const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setInner('rivalry-total-meetings-count', `${seriesMatches.length} Total Matches`);

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

  setInner('rivalry-m1-record', `${m1Wins}-${m2Wins}-${ties}`);
  setInner('rivalry-m2-record', `${m2Wins}-${m1Wins}-${ties}`);
  setInner('rivalry-m1-winpct', `${(m1WinPct * 100).toFixed(1)}%`);
  setInner('rivalry-m2-winpct', `${(m2WinPct * 100).toFixed(1)}%`);
  setInner('rivalry-m1-totalpts', `${m1TotalPts.toFixed(1)} pts`);
  setInner('rivalry-m2-totalpts', `${m2TotalPts.toFixed(1)} pts`);
  setInner('rivalry-m1-ppg', `${m1PPG} PPG`);
  setInner('rivalry-m2-ppg', `${m2PPG} PPG`);
  setInner('rivalry-m1-reg', `${m1RegWins} Wins`);
  setInner('rivalry-m2-reg', `${m2RegWins} Wins`);
  setInner('rivalry-m1-playoffs', `${m1PlayoffWins} Wins`);
  setInner('rivalry-m2-playoffs', `${m2PlayoffWins} Wins`);

  if (maxMarginMatch) {
    setInner('rivalry-sup-blowout-match', `${maxMarginMatch.winner_owner} (+${maxMarginMatch.margin.toFixed(1)} pts)`);
    setInner('rivalry-sup-blowout-desc', `${maxMarginMatch.home_score.toFixed(1)} - ${maxMarginMatch.away_score.toFixed(1)} ('${String(maxMarginMatch.year).slice(-2)} Wk ${maxMarginMatch.week})`);
  }
  if (minMarginMatch) {
    setInner('rivalry-sup-closest-match', `${minMarginMatch.winner_owner} def. ${minMarginMatch.winner_owner === minMarginMatch.home_owner ? minMarginMatch.away_owner : minMarginMatch.home_owner}`);
    setInner('rivalry-sup-closest-desc', `+${minMarginMatch.margin.toFixed(2)} pts margin ('${String(minMarginMatch.year).slice(-2)} Wk ${minMarginMatch.week})`);
  }
  if (maxCombinedMatch) {
    setInner('rivalry-sup-high-score', `${maxCombinedPts.toFixed(1)} Combined Pts`);
    setInner('rivalry-sup-high-desc', `${maxCombinedMatch.home_owner} (${maxCombinedMatch.home_score.toFixed(1)}) vs ${maxCombinedMatch.away_owner} (${maxCombinedMatch.away_score.toFixed(1)}) in '${String(maxCombinedMatch.year).slice(-2)} Wk ${maxCombinedMatch.week}`);
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
  const recapYearEl = document.getElementById('recapYear');
  if (!recapYearEl) return;

  const years = (RAW_DATA?.years && RAW_DATA.years.length > 0) ? RAW_DATA.years : [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  recapYearEl.innerHTML = '';
  years.slice().reverse().forEach(yr => {
    recapYearEl.add(new Option(yr, yr));
  });

  onRecapYearChange();
}

function initChartControls() {
  const select = document.getElementById('chartSeasonSelect');
  if (!select) return;

  const years = (RAW_DATA?.years && RAW_DATA.years.length > 0) ? RAW_DATA.years : [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  select.innerHTML = '';
  years.slice().reverse().forEach(yr => {
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
  if (!select) return;

  const years = (RAW_DATA?.years && RAW_DATA.years.length > 0) ? RAW_DATA.years : [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  select.innerHTML = '';
  years.slice().reverse().forEach(yr => {
    select.add(new Option(`${yr} Season`, yr));
  });
}

function initBracketControls() {
  const select = document.getElementById('bracketYearSelect');
  if (!select) return;

  const years = (RAW_DATA?.years && RAW_DATA.years.length > 0) ? RAW_DATA.years : [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
  select.innerHTML = '';
  years.slice().reverse().forEach(yr => {
    select.add(new Option(`${yr} Postseason`, yr));
  });
  
  // Forces the bracket to actually draw when the page loads
  setTimeout(() => renderBrackets(), 50);
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
  const recapYearEl = document.getElementById('recapYear');
  const recapWeek = document.getElementById('recapWeek');
  if (!recapYearEl || !recapWeek || !RAW_DATA?.matchups) return;

  const recapYear = parseInt(recapYearEl.value);
  if (isNaN(recapYear)) return;

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
  const startVal = document.getElementById('startYear')?.value;
  const endVal = document.getElementById('endYear')?.value;
  const minYr = startVal ? parseInt(startVal) : 0;
  const maxYr = endVal ? parseInt(endVal) : 9999;
  const gameType = document.getElementById('gameType')?.value || 'all';

  return RAW_DATA.matchups.filter(m => {
    const y = Number(m.year);
    const inYear = (!minYr || isNaN(minYr) || y >= minYr) && (!maxYr || isNaN(maxYr) || y <= maxYr);
    if (!inYear) return false;
    if (gameType === 'regular') return m.matchup_type === 'REGULAR';
    if (gameType === 'playoff') return m.matchup_type === 'PLAYOFF';
    if (gameType === 'consolation') return m.matchup_type === 'CONSOLATION';
    return true;
  });
}

function getFilteredRosterStats() {
  if (!RAW_DATA?.roster_stats) return [];
  const startVal = document.getElementById('startYear')?.value;
  const endVal = document.getElementById('endYear')?.value;
  const minYr = startVal ? parseInt(startVal) : 0;
  const maxYr = endVal ? parseInt(endVal) : 9999;
  const gameType = document.getElementById('gameType')?.value || 'all';

  return RAW_DATA.roster_stats.filter(r => {
    const y = Number(r.year);
    const inYear = (!minYr || isNaN(minYr) || y >= minYr) && (!maxYr || isNaN(maxYr) || y <= maxYr);
    if (!inYear) return false;
    if (gameType === 'regular') return r.matchup_type === 'REGULAR';
    if (gameType === 'playoff') return r.matchup_type === 'PLAYOFF';
    if (gameType === 'consolation') return r.matchup_type === 'CONSOLATION';
    return true;
  });
}

function getFilteredTeamsHistory() {
  if (!RAW_DATA?.teams_history) return [];
  const startVal = document.getElementById('startYear')?.value;
  const endVal = document.getElementById('endYear')?.value;
  const minYr = startVal ? parseInt(startVal) : 0;
  const maxYr = endVal ? parseInt(endVal) : 9999;

  return RAW_DATA.teams_history.filter(t => {
    const y = Number(t.year);
    return (!minYr || isNaN(minYr) || y >= minYr) && (!maxYr || isNaN(maxYr) || y <= maxYr);
  });
}

function getFilteredGooseEggs() {
  if (!RAW_DATA?.goose_eggs) return [];
  const startVal = document.getElementById('startYear')?.value;
  const endVal = document.getElementById('endYear')?.value;
  const minYr = startVal ? parseInt(startVal) : 0;
  const maxYr = endVal ? parseInt(endVal) : 9999;
  const gameType = document.getElementById('gameType')?.value || 'all';

  return RAW_DATA.goose_eggs.filter(g => {
    const y = Number(g.year);
    const inYear = (!minYr || isNaN(minYr) || y >= minYr) && (!maxYr || isNaN(maxYr) || y <= maxYr);
    if (!inYear) return false;
    if (gameType === 'regular') return m.matchup_type === 'REGULAR';
    if (gameType === 'playoff') return m.matchup_type === 'PLAYOFF';
    if (gameType === 'consolation') return m.matchup_type === 'CONSOLATION';
    return true;
  });
}

function getFilteredPlayerSeasons() {
  if (!RAW_DATA?.player_seasons) return [];
  const startVal = document.getElementById('startYear')?.value;
  const endVal = document.getElementById('endYear')?.value;
  const minYr = startVal ? parseInt(startVal) : 0;
  const maxYr = endVal ? parseInt(endVal) : 9999;

  return RAW_DATA.player_seasons.filter(ps => {
    const y = Number(ps.year);
    return (!minYr || isNaN(minYr) || y >= minYr) && (!maxYr || isNaN(maxYr) || y <= maxYr);
  });
}

function renderAll() {
  const matches = getFilteredMatchups();
  const rosterStats = getFilteredRosterStats();
  const teamsHistory = getFilteredTeamsHistory();
  const gooseEggs = getFilteredGooseEggs();
  const playerSeasons = getFilteredPlayerSeasons();

  safeExecute("renderSummaryCards", () => renderSummaryCards(matches));
  safeExecute("renderStandings", () => renderStandings(matches));
  safeExecute("runMonteCarloSimulation", runMonteCarloSimulation);
  safeExecute("renderDraftVault", renderDraftVault);
  safeExecute("renderRivalry", renderRivalry);
  safeExecute("renderBrackets", renderBrackets);
  safeExecute("renderTrades", renderTrades);
  safeExecute("renderStorylines", renderStorylines);
  safeExecute("renderNarratives", renderNarratives);
  safeExecute("renderDreamTeam", () => renderDreamTeam(playerSeasons));
  safeExecute("renderFinishes", () => renderFinishes(teamsHistory));
  safeExecute("renderH2HMatrix", () => renderH2HMatrix(matches));
  safeExecute("renderRecords", () => renderRecords(matches));
  safeExecute("renderEfficiency", () => renderEfficiency(rosterStats));
  safeExecute("renderPositions", () => renderPositions(rosterStats));
  safeExecute("renderRecap", renderRecap);
  safeExecute("renderTrajectoryChart", renderTrajectoryChart);
  safeExecute("renderScatterChart", () => renderScatterChart(matches));
  safeExecute("renderConsistencyChart", () => renderConsistencyChart(matches));
  safeExecute("renderKeepers", renderKeepers);
  safeExecute("renderBadBeats", () => renderBadBeats(matches, gooseEggs));
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

  const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setInner('stat-high-score', maxScore > 0 ? maxScore.toFixed(1) : '--');
  setInner('stat-closest-game', minMargin < 999 ? `${minMargin.toFixed(2)} pts` : '--');
  setInner('stat-avg-ppg', matches.length ? (totalPoints / (matches.length * 2)).toFixed(1) : '--');
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
    const aliasesDisplay = (prof.all_aliases || []).join(' • ');

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-3 font-semibold text-slate-500">#${idx + 1}</td>
        <td class="p-3">
          <button onclick="openManagerDossier('${safeMgr}')" class="text-left group focus:outline-none block">
            <div class="font-bold text-slate-100 group-hover:text-emerald-400 flex items-center gap-1.5 transition">
              <span>${s.manager}</span>
              <span class="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition">🔍</span>
            </div>
            <div class="text-xs text-slate-400 truncate max-w-[280px]" title="${aliasesDisplay}">
              ${aliasesDisplay}
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

// ----------------------------------------------------
// FRANCHISE DOSSIER MODAL
// ----------------------------------------------------
function openManagerDossier(mgrName) {
  const modal = document.getElementById('manager-dossier-modal');
  if (!modal || !RAW_DATA) return;

  const prof = RAW_DATA.manager_profiles?.[mgrName] || { latest_team_name: mgrName, all_aliases: [], years_active: [] };
  const allMatches = RAW_DATA.matchups || [];
  const teamsHistory = (RAW_DATA.teams_history || []).filter(t => t.owner_name === mgrName);

  const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

  setInner('dossier-mgr-name', mgrName);
  setInner('dossier-aliases-list', (prof.all_aliases && prof.all_aliases.length > 0) 
    ? `Franchise Aliases: ${prof.all_aliases.join(' • ')}`
    : `Latest: ${prof.latest_team_name}`);

  let gold = 0, silver = 0, bronze = 0;
  teamsHistory.forEach(t => {
    if (t.final_standing === 1) gold++;
    else if (t.final_standing === 2) silver++;
    else if (t.final_standing === 3) bronze++;
  });

  const podiumEl = document.getElementById('dossier-podium-badges');
  if (podiumEl) {
    podiumEl.innerHTML = `
      <span class="text-amber-400 font-bold">🥇 ${gold}</span>
      <span class="text-slate-500 mx-0.5">|</span>
      <span class="text-slate-300 font-bold">🥈 ${silver}</span>
      <span class="text-slate-500 mx-0.5">|</span>
      <span class="text-amber-600 font-bold">🥉 ${bronze}</span>
    `;
  }

  let wins = 0, losses = 0, ties = 0, pf = 0, games = 0;
  const oppMap = {};
  const seasonStatsMap = {}; // Track wins/pts per year for the charts

  allMatches.forEach(m => {
    const isHome = m.home_owner === mgrName;
    const isAway = m.away_owner === mgrName;
    if (!isHome && !isAway) return;

    const myScore = isHome ? m.home_score : m.away_score;
    const oppScore = isHome ? m.away_score : m.home_score;
    
    // Skip unplayed future games
    if (myScore === 0 && oppScore === 0) return;

    games++;
    pf += myScore;
    const opp = isHome ? m.away_owner : m.home_owner;

    if (!oppMap[opp]) oppMap[opp] = { opp, wins: 0, losses: 0, ties: 0, games: 0 };
    oppMap[opp].games++;

    // Track season-by-season performance for charts
    if (!seasonStatsMap[m.year]) seasonStatsMap[m.year] = { wins: 0, points_for: 0 };
    seasonStatsMap[m.year].points_for += myScore;

    if (myScore > oppScore) {
      wins++;
      oppMap[opp].wins++;
      seasonStatsMap[m.year].wins++;
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

  setInner('dossier-stat-record', `${wins}-${losses}-${ties}`);
  setInner('dossier-stat-winpct', `${(winPct * 100).toFixed(1)}% Win Rate`);
  setInner('dossier-stat-pf', `${pf.toFixed(1)} PF`);
  setInner('dossier-stat-ppg', `${ppg} PPG (${games} Gms)`);

  const streakInfo = RAW_DATA.streaks_data?.[mgrName] || { longest_win_streak: 0, longest_loss_streak: 0 };
  setInner('dossier-stat-win-streak', `${streakInfo.longest_win_streak}W Streak`);
  setInner('dossier-stat-loss-streak', `${streakInfo.longest_loss_streak}L Skid`);

  const oppList = Object.values(oppMap).filter(o => o.games >= 2);
  
  if (oppList.length > 0) {
    const nemesis = [...oppList].sort((a, b) => (a.wins / a.games) - (b.wins / b.games) || b.losses - a.losses)[0];
    const bunny = [...oppList].sort((a, b) => (b.wins / b.games) - (a.wins / a.games) || b.wins - a.wins)[0];

    setInner('dossier-nemesis-name', nemesis.opp);
    setInner('dossier-nemesis-desc', `${((nemesis.wins / nemesis.games) * 100).toFixed(0)}% Win Rate in ${nemesis.games} Meetings`);
    setInner('dossier-nemesis-record', `${nemesis.wins}-${nemesis.losses}`);

    setInner('dossier-bunny-name', bunny.opp);
    setInner('dossier-bunny-desc', `${((bunny.wins / bunny.games) * 100).toFixed(0)}% Win Rate in ${bunny.games} Meetings`);
    setInner('dossier-bunny-record', `${bunny.wins}-${bunny.losses}`);
  } else {
    setInner('dossier-nemesis-name', "None Yet");
    setInner('dossier-nemesis-desc', "--");
    setInner('dossier-nemesis-record', "-");
    setInner('dossier-bunny-name', "None Yet");
    setInner('dossier-bunny-desc', "--");
    setInner('dossier-bunny-record', "-");
  }

  const managerCornerstones = (RAW_DATA.cornerstone_stats || [])
    .filter(c => c.owner === mgrName)
    .sort((a, b) => b.starter_pts - a.starter_pts)
    .slice(0, 4);

  const rushmoreGrid = document.getElementById('dossier-rushmore-grid');
  if (rushmoreGrid) {
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
  }

  const sortedHistory = [...teamsHistory].sort((a, b) => b.year - a.year);
  const seasonsBody = document.getElementById('dossier-seasons-body');

  if (seasonsBody) {
    seasonsBody.innerHTML = sortedHistory.map(t => {
      const yrMatches = allMatches.filter(m => m.year === t.year && m.matchup_type === 'REGULAR' && (m.home_owner === mgrName || m.away_owner === mgrName));
      let yWins = 0, yLosses = 0, yTies = 0, yPf = 0;

      yrMatches.forEach(m => {
        const isH = m.home_owner === mgrName;
        const s = isH ? m.home_score : m.away_score;
        const oppS = isH ? m.away_score : m.home_score;
        if (s === 0 && oppS === 0) return; // skip unplayed
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
  }

  // Render Achievement Badges
  try {
    renderDossierBadges(mgrName);
  } catch (err) {
    console.error("Badge rendering failed:", err);
  }

  // Render Season-over-Season Charts
  try {
    renderDossierCharts(mgrName, seasonStatsMap);
  } catch (err) {
    console.error("Dossier chart rendering failed:", err);
  }

  modal.classList.remove('hidden');
}

// ----------------------------------------------------
// DOSSIER SEASON-OVER-SEASON CHARTS
// ----------------------------------------------------
if (typeof dossierWinsChartInstance === 'undefined') {
  var dossierWinsChartInstance = null;
}
if (typeof dossierPtsChartInstance === 'undefined') {
  var dossierPtsChartInstance = null;
}

function renderDossierCharts(managerName, seasonMap) {
  const seasons = Object.keys(seasonMap).sort((a, b) => parseInt(a) - parseInt(b));
  const winsData = seasons.map(yr => seasonMap[yr].wins);
  const ptsData = seasons.map(yr => seasonMap[yr].points_for);

  // Wins Line Chart
  const ctxWins = document.getElementById('dossierChartWins')?.getContext('2d');
  if (ctxWins) {
    if (dossierWinsChartInstance) dossierWinsChartInstance.destroy();
    dossierWinsChartInstance = new Chart(ctxWins, {
      type: 'line',
      data: {
        labels: seasons,
        datasets: [{
          label: 'Wins',
          data: winsData,
          borderColor: '#34d399',
          backgroundColor: 'rgba(52, 211, 153, 0.1)',
          fill: true,
          tension: 0.2,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: 'Season Wins', color: '#94a3b8', font: { size: 10 } } },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: '#1e293b' } },
          y: { ticks: { color: '#64748b', font: { size: 9 }, stepSize: 2 }, grid: { color: '#1e293b' } }
        }
      }
    });
  }

  // Points Bar Chart
  const ctxPts = document.getElementById('dossierChartPts')?.getContext('2d');
  if (ctxPts) {
    if (dossierPtsChartInstance) dossierPtsChartInstance.destroy();
    dossierPtsChartInstance = new Chart(ctxPts, {
      type: 'bar',
      data: {
        labels: seasons,
        datasets: [{
          label: 'Points For',
          data: ptsData,
          backgroundColor: 'rgba(99, 102, 241, 0.5)',
          borderColor: '#6366f1',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: 'Total Points Scored', color: '#94a3b8', font: { size: 10 } } },
        scales: {
          x: { ticks: { color: '#64748b', font: { size: 9 } }, grid: { color: '#1e293b' } },
          y: { ticks: { color: '#64748b', font: { size: 9 }, grid: { color: '#1e293b' } } }
        }
      }
    });
  }
}

function closeManagerDossier() {
  const modal = document.getElementById('manager-dossier-modal');
  if (modal) modal.classList.add('hidden');
}

// ----------------------------------------------------
// PLAYOFF & CONSOLATION BRACKETS
// ----------------------------------------------------
function renderBrackets() {
  const container = document.getElementById('bracket-tree-container');
  const select = document.getElementById('bracketYearSelect');
  if (!container || !select || !RAW_DATA?.brackets_by_season) return;

  const yr = parseInt(select.value);
  if (isNaN(yr)) return;

  const bracketData = RAW_DATA.brackets_by_season[yr];

  if (!bracketData) {
    container.innerHTML = `<div class="p-6 text-center text-slate-500">No bracket data found for ${yr}.</div>`;
    return;
  }

  const rounds = currentBracketMode === 'championship' ? bracketData.playoff_rounds : bracketData.consolation_rounds;

  if (!rounds || !rounds.length) {
    container.innerHTML = `<div class="p-8 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">No ${currentBracketMode === 'championship' ? 'championship playoff' : 'consolation'} matchups recorded for ${yr}.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="flex items-start gap-8 min-w-[750px] p-2">
      ${rounds.map(r => `
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
                  <div class="flex items-center justify-between gap-2">
                    <button onclick="openLineupModal(${m.year}, ${m.week}, '${safeHome}')" class="text-left flex-1 truncate group focus:outline-none">
                      <span class="font-bold text-xs ${homeWon ? 'text-emerald-400' : 'text-slate-300'} group-hover:text-emerald-300 transition">${m.home_owner}</span>
                    </button>
                    <span class="font-mono text-xs font-bold ${homeWon ? 'text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded' : 'text-slate-500'}">${m.home_score.toFixed(1)}</span>
                  </div>
                  <div class="h-px bg-slate-800/80"></div>
                  <div class="flex items-center justify-between gap-2">
                    <button onclick="openLineupModal(${m.year}, ${m.week}, '${safeAway}')" class="text-left flex-1 truncate group focus:outline-none">
                      <span class="font-bold text-xs ${awayWon ? 'text-emerald-400' : 'text-slate-300'} group-hover:text-emerald-300 transition">${m.away_owner}</span>
                    </button>
                    <span class="font-mono text-xs font-bold ${awayWon ? 'text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded' : 'text-slate-500'}">${m.away_score.toFixed(1)}</span>
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ----------------------------------------------------
// TRADE LEDGER & ROI
// ----------------------------------------------------
function renderTrades() {
  const tbody = document.getElementById('trades-table-body');
  if (!tbody || !RAW_DATA?.trades_data) return;

  const minYr = parseInt(document.getElementById('startYear')?.value || 0);
  const maxYr = parseInt(document.getElementById('endYear')?.value || 9999);
  const selectedManager = document.getElementById('tradeManagerFilter')?.value || 'all';

  const trades = RAW_DATA.trades_data.filter(t => {
    if (t.year < minYr || t.year > maxYr) return false;
    if (selectedManager !== 'all' && t.from_owner !== selectedManager && t.to_owner !== selectedManager) return false;
    return true;
  });

  const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setInner('trades-total-count', trades.length);

  const tradeCounts = {};
  trades.forEach(t => {
    tradeCounts[t.to_owner] = (tradeCounts[t.to_owner] || 0) + 1;
    tradeCounts[t.from_owner] = (tradeCounts[t.from_owner] || 0) + 1;
  });

  const topTrader = Object.entries(tradeCounts).sort((a, b) => b[1] - a[1])[0];
  if (topTrader) {
    setInner('trades-active-manager', topTrader[0]);
    setInner('trades-active-desc', `${topTrader[1]} total trades executed`);
  }

  const topRoi = [...trades].sort((a, b) => b.pts_produced - a.pts_produced)[0];
  if (topRoi) {
    setInner('trades-top-roi-player', `${topRoi.player} (${topRoi.pos})`);
    setInner('trades-top-roi-desc', `${topRoi.pts_produced.toFixed(1)} pts produced for ${topRoi.to_owner} in '${String(topRoi.year).slice(-2)}`);
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
  if (!tbody || !RAW_DATA?.streaks_data) return;

  const streaks = Object.values(RAW_DATA.streaks_data)
    .filter(s => s.total_games > 0)
    .sort((a, b) => b.longest_win_streak - a.longest_win_streak || a.longest_loss_streak - b.longest_loss_streak);

  if (!streaks.length) return;

  const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

  const bestWin = [...streaks].sort((a, b) => b.longest_win_streak - a.longest_win_streak)[0];
  const worstLoss = [...streaks].sort((a, b) => b.longest_loss_streak - a.longest_loss_streak)[0];
  const hotActive = [...streaks].filter(s => s.active_type === 'W').sort((a, b) => b.active_count - a.active_count)[0] || streaks[0];

  if (bestWin) setInner('streak-win-manager', `${bestWin.manager} (${bestWin.longest_win_streak}W)`);
  if (worstLoss) setInner('streak-loss-manager', `${worstLoss.manager} (${worstLoss.longest_loss_streak}L)`);
  if (hotActive) setInner('streak-active-manager', `${hotActive.manager} (${hotActive.active_count}${hotActive.active_type})`);

  tbody.innerHTML = streaks.map(s => {
    const activeBadge = s.active_type === 'W'
      ? `<span class="font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">🔥 ${s.active_count}W</span>`
      : s.active_type === 'L'
      ? `<span class="font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">🧊 ${s.active_count}L</span>`
      : `<span class="text-slate-500 font-mono">-</span>`;

    const last5Badges = (s.last_5 || []).map(out => {
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
  if (!grid || !select || !RAW_DATA?.season_narratives) return;

  const yr = parseInt(select.value);
  if (isNaN(yr)) return;

  const narrative = RAW_DATA.season_narratives[yr];

  if (!narrative) {
    grid.innerHTML = `<div class="col-span-full text-slate-500 text-sm py-6 text-center">No regular season narrative data for ${yr}.</div>`;
    return;
  }

  const cards = [
    {
      title: "🍀 Regular Season Overachiever",
      manager: narrative.overachiever?.owner || '--',
      detail: `+${narrative.overachiever?.diff || 0} wins over expected (${narrative.overachiever?.wins || 0} Wins vs ${narrative.overachiever?.exp_wins || 0} Expected)`,
      badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
    },
    {
      title: "🌧️ Hard Luck Franchise",
      manager: narrative.underachiever?.owner || '--',
      detail: `${narrative.underachiever?.diff || 0} wins under expected (${narrative.underachiever?.wins || 0} Wins vs ${narrative.underachiever?.exp_wins || 0} Expected)`,
      badge: "border-rose-500/20 bg-rose-500/10 text-rose-400"
    },
    {
      title: "⚡ The Juggernaut (Scoring Champ)",
      manager: narrative.juggernaut?.owner || '--',
      detail: `League-leading ${narrative.juggernaut?.pf || 0} Total PF (${narrative.juggernaut?.ppg || 0} PPG)`,
      badge: "border-cyan-500/20 bg-cyan-500/10 text-cyan-400"
    },
    {
      title: "🛡️ The Iron Curtain (Lowest PA)",
      manager: narrative.iron_curtain?.owner || '--',
      detail: `Fewest points surrendered: ${narrative.iron_curtain?.pa || 0} PA (${narrative.iron_curtain?.ppg || 0} Opp PPG)`,
      badge: "border-indigo-500/20 bg-indigo-500/10 text-indigo-400"
    },
    {
      title: "💓 Cardiac Kids (Clutch Wins)",
      manager: narrative.cardiac?.owner || '--',
      detail: `${narrative.cardiac?.close_wins || 0} victories decided by < 5.0 points`,
      badge: "border-amber-500/20 bg-amber-500/10 text-amber-400"
    },
    {
      title: "💔 Heartbreak Hotel (Nail-Biter Losses)",
      manager: narrative.heartbreak?.owner || '--',
      detail: `${narrative.heartbreak?.close_losses || 0} heartbreaking losses decided by < 5.0 points`,
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
  const badge = document.getElementById('playoff-race-season-badge');
  if (badge) badge.innerText = `${yr} Regular Season`;

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
  const totalPtsEl = document.getElementById('dreamteam-total-pts');
  if (totalPtsEl) totalPtsEl.innerText = `${totalDreamPts.toFixed(1)} PTS`;

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
  if (!tbody || !RAW_DATA?.player_seasons) return;

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

  const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

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
  getManagerList().forEach(m => {
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
    setInner('badbeat-high-loser', `${topLoser.loser_score.toFixed(1)} pts (${topLoser.loser_owner})`);
    setInner('badbeat-high-desc', `Lost to ${topLoser.winner_owner} (${topLoser.winner_score.toFixed(1)}) in ${topLoser.year} Wk ${topLoser.week}`);
  }

  if (heartbreaks.length > 0) {
    const topClose = heartbreaks[0];
    setInner('badbeat-narrow-match', `-${topClose.margin.toFixed(2)} pts (${topClose.loser_owner})`);
    setInner('badbeat-narrow-desc', `${topClose.loser_score.toFixed(1)} vs ${topClose.winner_score.toFixed(1)} (${topClose.winner_owner}, ${topClose.year} Wk ${topClose.week})`);
  }

  if (sortedPain.length > 0) {
    const unluckiest = sortedPain[0];
    setInner('badbeat-victim-name', unluckiest.manager);
    setInner('badbeat-victim-desc', `${unluckiest.high_losses} losses ≥ 130 pts • ${unluckiest.nail_biters} losses < 3 pts`);
  }

  const gooseBody = document.getElementById('goose-egg-body');
  setInner('goose-egg-total-count', `${gooseEggs.length} Goose Eggs`);

  if (!gooseEggs.length) {
    if (gooseBody) gooseBody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-slate-500">No starting goose eggs found for this filter.</td></tr>`;
    return;
  }

  const sortedGoose = [...gooseEggs].sort((a, b) => a.points - b.points || b.year - a.year);
  if (gooseBody) {
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
}

// ----------------------------------------------------
// KEEPERS AND FRANCHISE CORNERSTONES (MULTI-YEAR)
// ----------------------------------------------------
function renderKeepers() {
  const tbCorner = document.getElementById('keepers-table-body');
  const tbTrue = document.getElementById('true-keepers-body');

  const minYr = parseInt(document.getElementById('startYear')?.value) || 0;
  const maxYr = parseInt(document.getElementById('endYear')?.value) || 9999;
  const selectedManager = document.getElementById('keeper-manager-filter')?.value || 'all';

  if (tbCorner && RAW_DATA?.cornerstone_stats) {
    const minS = parseInt(document.getElementById('keeper-min-seasons')?.value) || 2;
    const filteredC = RAW_DATA.cornerstone_stats.filter(c => {
      if (selectedManager !== 'all' && c.owner !== selectedManager) return false;
      if (c.seasons < minS) return false;
      return (c.years_list || []).some(y => y >= minYr && y <= maxYr);
    }).sort((a, b) => b.starter_pts - a.starter_pts || b.seasons - a.seasons);

    tbCorner.innerHTML = filteredC.map((c, i) => `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-3 font-semibold text-slate-500">#${i + 1}</td>
        <td class="p-3 font-bold text-white">${c.player}</td>
        <td class="p-3 font-mono text-xs text-slate-400">${c.pos}</td>
        <td class="p-3">${c.owner}</td>
        <td class="p-3 text-center text-emerald-400 font-bold">${c.seasons}</td>
        <td class="p-3">
          <div class="flex flex-wrap gap-1">
            ${(c.years_list || []).map(y => `<span class="px-2 py-0.5 rounded text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700">'${String(y).slice(-2)}</span>`).join('')}
          </div>
        </td>
        <td class="p-3 text-right text-emerald-400 font-bold">${c.starter_pts.toFixed(1)}</td>
      </tr>`).join('');
  }

  if (tbTrue && RAW_DATA?.true_keepers) {
    const filteredK = RAW_DATA.true_keepers.filter(k => {
      if (selectedManager !== 'all' && k.owner !== selectedManager) return false;
      return k.year >= minYr && k.year <= maxYr;
    }).sort((a, b) => b.year - a.year || b.starter_pts - a.starter_pts);

    tbTrue.innerHTML = filteredK.map(k => `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-3 font-mono text-slate-400">'${String(k.year).slice(-2)}</td>
        <td class="p-3 font-bold text-white">${k.player}</td>
        <td class="p-3 font-mono text-xs text-slate-400">${k.pos}</td>
        <td class="p-3">${k.owner}</td>
        <td class="p-3 text-center font-mono text-amber-400">Rd ${k.round_num}</td>
        <td class="p-3 text-right font-mono font-bold text-emerald-400">${k.starter_pts.toFixed(1)} pts</td>
      </tr>`).join('');
  }
}

// ----------------------------------------------------
// CHARTS
// ----------------------------------------------------
function renderTrajectoryChart() {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('trajectoryCanvas');
  const select = document.getElementById('chartSeasonSelect');
  if (!canvas || !select || !RAW_DATA?.matchups) return;

  const yr = parseInt(select.value);
  if (isNaN(yr)) return;

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

function renderScatterChart(matches) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('scatterCanvas');
  if (!canvas || !RAW_DATA) return;

  const stats = {};
  matches.forEach(m => {
    [
      { o: m.home_owner, score: m.home_score, opp: m.away_score },
      { o: m.away_owner, score: m.away_score, opp: m.home_score }
    ].forEach(({ o, score, opp }) => {
      if (o) {
        if (!stats[o]) stats[o] = { owner: o, wins: 0, games: 0, pf: 0 };
        stats[o].games += 1;
        stats[o].pf += score;
        if (score > opp) stats[o].wins += 1;
        else if (score === opp) stats[o].wins += 0.5;
      }
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

function renderConsistencyChart(matches) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById('consistencyCanvas');
  if (!canvas || !RAW_DATA) return;

  const scoreMap = {};
  matches.forEach(m => {
    if (m.home_owner && !scoreMap[m.home_owner]) scoreMap[m.home_owner] = [];
    if (m.away_owner && !scoreMap[m.away_owner]) scoreMap[m.away_owner] = [];
    if (m.home_owner) scoreMap[m.home_owner].push(m.home_score);
    if (m.away_owner) scoreMap[m.away_owner].push(m.away_score);
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
  if (!recapYearEl || !recapWeekEl || !recapYearEl.value || !recapWeekEl.value || !RAW_DATA?.matchups) return;

  const yr = parseInt(recapYearEl.value);
  const wk = parseInt(recapWeekEl.value);

  if (isNaN(yr) || isNaN(wk)) return;

  const weekMatches = RAW_DATA.matchups.filter(m => m.year === yr && m.week === wk);

  if (!weekMatches.length) {
    const listEl = document.getElementById('recap-matchups-list');
    if (listEl) listEl.innerHTML = `<div class="text-slate-500 text-sm py-4 text-center">No matchups recorded for Year ${yr}, Week ${wk}.</div>`;
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

  const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

  setInner('recap-king-name', king);
  setInner('recap-king-pts', `${topScore.toFixed(2)} pts`);
  setInner('recap-chump-name', chump);
  setInner('recap-chump-pts', `${lowScore.toFixed(2)} pts`);
  setInner('recap-nail-match', nailMatch);
  setInner('recap-nail-margin', minMargin < 999 ? `+${minMargin.toFixed(2)} pts margin` : '--');

  const key = `${yr}_${wk}`;
  const weekPlayerData = RAW_DATA.weekly_players ? RAW_DATA.weekly_players[key] : null;
  const blunder = weekPlayerData?.bench_blunder;

  if (blunder) {
    setInner('recap-bench-player', `${blunder.name} (${blunder.pos})`);
    setInner('recap-bench-owner', `${blunder.points.toFixed(1)} pts on ${blunder.owner}'s bench`);
  } else {
    setInner('recap-bench-player', "None");
    setInner('recap-bench-owner', "--");
  }

  setInner('recap-game-count', `${weekMatches.length} Matchups`);
  const matchupsList = document.getElementById('recap-matchups-list');
  if (matchupsList) {
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
  }

  const topPlayersBody = document.getElementById('recap-top-players-body');
  if (topPlayersBody) {
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
}

function renderSeasonBountyBoard(yr) {
  const tbody = document.getElementById('season-bounty-body');
  if (!tbody || !RAW_DATA?.matchups) return;

  const yearMatches = RAW_DATA.matchups.filter(m => m.year === yr && m.matchup_type === 'REGULAR');
  const weekGroups = {};
  yearMatches.forEach(m => {
    if (!weekGroups[m.week]) weekGroups[m.week] = [];
    weekGroups[m.week].push({ owner: m.home_owner, score: m.home_score });
    weekGroups[m.week].push({ owner: m.away_owner, score: m.away_score });
  });

  const totalWeeks = Object.keys(weekGroups).length;
  const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setInner('recap-season-weeks-count', `${totalWeeks} Regular Season Weeks`);

  const bountyMap = {};
  getManagerList().forEach(m => {
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
  getManagerList().forEach(m => {
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
    const safeMgr = f.manager.replace(/'/g, "\\'");

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-3">
          <button onclick="openManagerDossier('${safeMgr}')" class="font-bold text-slate-100 hover:text-emerald-400 text-left transition">
            ${f.manager}
          </button>
        </td>
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
  const activeManagers = getManagerList().filter(m => {
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
    const safeR = r.replace(/'/g, "\\'");
    tableHtml += `<tr><td class="p-2 text-left font-medium text-slate-200 bg-slate-800/40 truncate max-w-[120px]" title="${r}"><button onclick="openManagerDossier('${safeR}')" class="hover:text-emerald-400 hover:underline text-left">${r}</button></td>`;
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
  const container = document.getElementById('h2h-container');
  if (container) container.innerHTML = tableHtml;
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

  // Fallback to RAW_DATA payload if rosterStats isn't passed or is empty
  let list = [];
  
  if (rosterStats && rosterStats.length > 0) {
    const managerMap = {};
    rosterStats.forEach(r => {
      if (!managerMap[r.owner]) {
        managerMap[r.owner] = { owner: r.owner, start_pts: 0, bench_pts: 0, games: 0, optimal_pts: 0 };
      }
      managerMap[r.owner].start_pts += r.start_pts;
      managerMap[r.owner].bench_pts += r.bench_pts;
      managerMap[r.owner].games += 1;
      // Approximate optimal if filtering dynamically, or fallback safely
      managerMap[r.owner].optimal_pts += Math.max(r.start_pts, r.start_pts + (r.bench_pts * 0.2)); 
    });

    list = Object.values(managerMap)
      .filter(m => m.games > 0)
      .map(m => {
        const actual_ppg = m.start_pts / m.games;
        const bench_ppg = m.bench_pts / m.games;
        const optimal_ppg = m.optimal_pts / m.games;
        const efficiency_pct = optimal_ppg > 0 ? (actual_ppg / optimal_ppg) * 100 : 0;
        return { manager: m.owner, games: m.games, actual_ppg, bench_ppg, optimal_ppg, efficiency_pct };
      })
      .sort((a, b) => b.efficiency_pct - a.efficiency_pct); // Sorted high to low efficiency
  } else if (RAW_DATA?.efficiency_data) {
    // Use pre-computed backend efficiency payload
    list = [...RAW_DATA.efficiency_data];
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-500">No roster entries match this filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((item, idx) => {
    let rankBadge = "text-slate-400";
    if (idx < 3) rankBadge = "text-emerald-400 font-bold";
    if (idx >= list.length - 3 && list.length > 5) rankBadge = "text-rose-400 font-bold";
    
    const mgrName = item.owner || item.manager;
    const safeMgr = mgrName.replace(/'/g, "\\'");
    const gamesCount = item.games;
    const actualPPG = item.avgStart !== undefined ? item.avgStart : item.actual_ppg;
    const optPPG = item.optimal_ppg !== undefined ? item.optimal_ppg : actualPPG; // Safe fallback
    const benchPPG = item.avgBench !== undefined ? item.avgBench : item.bench_ppg;
    const effPct = item.efficiency_pct !== undefined ? item.efficiency_pct : (item.benchRatio ? (100 - item.benchRatio) : 0);

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-3 font-semibold ${rankBadge}">#${idx + 1}</td>
        <td class="p-3">
          <button onclick="openManagerDossier('${safeMgr}')" class="font-bold text-slate-100 hover:text-emerald-400 text-left transition">
            ${mgrName}
          </button>
        </td>
        <td class="p-3 text-center font-mono text-slate-400">${gamesCount}</td>
        <td class="p-3 text-right font-mono text-slate-200">${actualPPG.toFixed(1)}</td>
        <td class="p-3 text-right font-mono text-amber-400 font-bold">${optPPG.toFixed(1)}</td>
        <td class="p-3 text-right font-mono text-slate-400">${benchPPG.toFixed(1)}</td>
        <td class="p-3 text-right font-mono font-black ${rankBadge}">${effPct.toFixed(1)}%</td>
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

  const maxQB = list.length ? Math.max(...list.map(l => l.qb)) : 0;
  const maxRB = list.length ? Math.max(...list.map(l => l.rb)) : 0;
  const maxWR = list.length ? Math.max(...list.map(l => l.wr)) : 0;
  const maxTE = list.length ? Math.max(...list.map(l => l.te)) : 0;
  const maxKDef = list.length ? Math.max(...list.map(l => l.k_def)) : 0;

  tbody.innerHTML = list.map(m => {
    const safeMgr = m.owner.replace(/'/g, "\\'");
    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-3">
          <button onclick="openManagerDossier('${safeMgr}')" class="font-bold text-slate-100 hover:text-emerald-400 text-left transition">
            ${m.owner}
          </button>
        </td>
        <td class="p-3 text-right font-mono ${m.qb === maxQB ? 'text-amber-400 font-bold' : 'text-slate-300'}">${m.qb.toFixed(1)}</td>
        <td class="p-3 text-right font-mono ${m.rb === maxRB ? 'text-amber-400 font-bold' : 'text-slate-300'}">${m.rb.toFixed(1)}</td>
        <td class="p-3 text-right font-mono ${m.wr === maxWR ? 'text-amber-400 font-bold' : 'text-slate-300'}">${m.wr.toFixed(1)}</td>
        <td class="p-3 text-right font-mono ${m.te === maxTE && maxTE > 0 ? 'text-amber-400 font-bold' : 'text-slate-300'}">${m.te.toFixed(1)}</td>
        <td class="p-3 text-right font-mono ${m.k_def === maxKDef ? 'text-amber-400 font-bold' : 'text-slate-400'}">${m.k_def.toFixed(1)}</td>
        <td class="p-3 text-right font-mono font-bold text-emerald-400">${m.total.toFixed(1)}</td>
      </tr>
    `;
  }).join('');
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

  const setInner = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  setInner('modal-manager-name', owner);
  setInner('modal-matchup-subtitle', `${yr} Season • Week ${wk} Lineup`);
  setInner('modal-starter-pts', `Starters: ${lineupData.total_starter_pts.toFixed(1)} pts`);
  setInner('modal-bench-pts', `Bench: ${lineupData.total_bench_pts.toFixed(1)} pts`);

  const slotOrder = { 'QB': 1, 'RB': 2, 'WR': 3, 'TE': 4, 'FLEX': 5, 'D/ST': 6, 'K': 7 };
  const sortedStarters = [...(lineupData.starters || [])].sort((a, b) => (slotOrder[a.slot] || 99) - (slotOrder[b.slot] || 99) || b.points - a.points);
  const sortedBench = [...(lineupData.bench || [])].sort((a, b) => b.points - a.points);

  const startersBody = document.getElementById('modal-starters-body');
  if (startersBody) {
    startersBody.innerHTML = sortedStarters.map(p => `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-2 font-mono font-bold text-slate-400">${p.slot}</td>
        <td class="p-2 font-bold text-slate-100">${p.name}</td>
        <td class="p-2 font-mono text-slate-400">${p.pos}</td>
        <td class="p-2 text-right font-mono font-bold text-emerald-400">${p.points.toFixed(1)}</td>
      </tr>
    `).join('');
  }

  const benchBody = document.getElementById('modal-bench-body');
  if (benchBody) {
    benchBody.innerHTML = sortedBench.map(p => `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="p-2 font-mono font-bold text-slate-500">${p.slot}</td>
        <td class="p-2 font-bold text-slate-300">${p.name}</td>
        <td class="p-2 font-mono text-slate-500">${p.pos}</td>
        <td class="p-2 text-right font-mono font-bold text-amber-400">${p.points.toFixed(1)}</td>
      </tr>
    `).join('');
  }

  modal.classList.remove('hidden');
}

function closeLineupModal() {
  const modal = document.getElementById('lineup-modal');
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

// ----------------------------------------------------
// PAGE HELP & GLOSSARY SYSTEM
// ----------------------------------------------------
const PAGE_HELP = {
  standings: `
    <p class="mb-3">This page breaks down all-time regular season performance, including expected records and how lucky each manager has been.</p>
    <ul class="list-disc pl-5 space-y-2 text-slate-400">
      <li><strong class="text-slate-200">Exp W-L (Expected Record):</strong> Calculates your "All-Play" record. If you scored the 2nd most points in a week, you earn 10 Wins and 1 Loss, regardless of who you actually played.</li>
      <li><strong class="text-slate-200">Luck Rating:</strong> Actual Wins minus Expected Wins. <span class="text-emerald-400">+ numbers</span> indicate an easy schedule. <span class="text-rose-400">- numbers</span> indicate bad luck.</li>
    </ul>`,
  finishes: `
    <p class="mb-3">A historical tracker of final season standings and podium appearances.</p>
    <ul class="list-disc pl-5 space-y-2 text-slate-400">
      <li><strong class="text-slate-200">Top 3 Rate:</strong> The percentage of active seasons a manager finished in 1st, 2nd, or 3rd place.</li>
    </ul>`,
  drafts: `
    <p class="mb-3">The Draft Vault tracks draft capital return on investment (ROI), historical steals, and total busts.</p>
    <ul class="list-disc pl-5 space-y-2 text-slate-400">
      <li><strong class="text-slate-200">Hit Rate %:</strong> The percentage of drafted players that made 6 or more appearances in a manager's starting lineup.</li>
      <li><strong class="text-slate-200">Early Hit Rate:</strong> The hit rate specifically for premium players drafted in Rounds 1 through 3.</li>
      <li><strong class="text-slate-200">Round MVPs:</strong> The highest-scoring player ever drafted in that specific round across all seasons.</li>
    </ul>`,
  efficiency: `
    <p class="mb-3">Evaluates weekly lineup decisions to see who maximizes their roster and who leaves points on the bench.</p>
    <ul class="list-disc pl-5 space-y-2 text-slate-400">
      <li><strong class="text-slate-200">Start/Sit IQ (Bench Ratio):</strong> The ratio of bench points to starter points. A lower percentage indicates a highly efficient manager who rarely benches their best performers.</li>
    </ul>`,
  badbeats: `
    <p class="mb-3">The Hall of Pain measures heartbreak, narrow losses, and starting lineup goose eggs.</p>
    <ul class="list-disc pl-5 space-y-2 text-slate-400">
      <li><strong class="text-slate-200">Pain Score:</strong> A weighted metric. Losses scoring over 130 pts are worth 3x pain; losses by less than 3 points are 2x pain; starting a goose egg is 1.5x pain.</li>
    </ul>`,
  simulator: `
    <p class="mb-3">A Monte Carlo engine that simulates the remainder of the current regular season 10,000 times.</p>
    <ul class="list-disc pl-5 space-y-2 text-slate-400">
      <li><strong class="text-slate-200">Methodology:</strong> It calculates each team's average PPG and variance (standard deviation) to simulate future matchups using random Gaussian distributions.</li>
      <li><strong class="text-slate-200">Make Playoffs %:</strong> The likelihood a team clinches a top-6 seed.</li>
      <li><strong class="text-slate-200">Toilet Bowl %:</strong> The likelihood a team misses the playoffs entirely.</li>
    </ul>`,
  keepers: `
    <p class="mb-3">Tracks franchise loyalty and long-term roster retention.</p>
    <ul class="list-disc pl-5 space-y-2 text-slate-400">
      <li><strong class="text-slate-200">Official Retained Keepers:</strong> Players formally tagged with the 'Keeper' status by ESPN prior to the draft.</li>
      <li><strong class="text-slate-200">Multi-Year Cornerstones:</strong> Players who have remained on the same manager's roster for multiple years, regardless of how they were acquired.</li>
    </ul>`
};

function openPageHelp(viewId) {
  const body = document.getElementById('help-modal-body');
  const title = document.getElementById('help-modal-title');
  if (body && title) {
    const formattedTitle = viewId.charAt(0).toUpperCase() + viewId.slice(1).replace('-', ' ');
    title.innerText = "Guide: " + formattedTitle;
    body.innerHTML = PAGE_HELP[viewId] || `<p>Click any column header to instantly sort the data. Use the global filters at the top of the page to adjust the timeframe.</p>`;
    document.getElementById('page-help-modal').classList.remove('hidden');
  }
}

function closePageHelp() {
  const modal = document.getElementById('page-help-modal');
  if (modal) modal.classList.add('hidden');
}

// ----------------------------------------------------
// PLAYER DIRECTORY LOGIC
// ----------------------------------------------------
function renderPlayerDirectory() {
  const tb = document.getElementById('player-directory-body');
  const searchInput = document.getElementById('player-search-input');
  if (!tb || !RAW_DATA?.player_directory) return;

  const q = (searchInput?.value || '').toLowerCase();
  
  // Show top 100 by default, or filter completely by the search string
  let results = RAW_DATA.player_directory;
  if (q) {
    results = results.filter(p => p.name.toLowerCase().includes(q));
  }
  results = results.slice(0, 100); 

  if (!results.length) {
    tb.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-500">No players found matching "${q}".</td></tr>`;
    return;
  }

  tb.innerHTML = results.map(p => {
    const safeName = p.name.replace(/'/g, "\\'");
    return `
      <tr class="hover:bg-slate-800/40 transition cursor-pointer group" onclick="openPlayerDossier('${safeName}')">
        <td class="p-3 font-bold text-white group-hover:text-emerald-400 transition">${p.name}</td>
        <td class="p-3 font-mono text-xs text-slate-400">${p.pos}</td>
        <td class="p-3 text-center text-slate-300 font-mono">${p.starts}</td>
        <td class="p-3 text-right font-mono font-bold text-emerald-400">${p.starter_pts.toFixed(1)}</td>
        <td class="p-3 text-xs text-slate-500 truncate max-w-[200px]">${p.managers.join(', ')}</td>
      </tr>`;
  }).join('');
}

function openPlayerDossier(playerName) {
  if (!RAW_DATA?.player_directory) return;
  const p = RAW_DATA.player_directory.find(x => x.name === playerName);
  if (!p) return;

  document.getElementById('player-dossier-name').innerText = p.name;
  document.getElementById('player-dossier-pos').innerText = p.pos;
  document.getElementById('pd-stat-pts').innerText = p.starter_pts.toFixed(1);
  document.getElementById('pd-stat-starts').innerText = p.starts;
  document.getElementById('pd-stat-ppg').innerText = p.starts > 0 ? (p.starter_pts / p.starts).toFixed(1) : '0.0';
  document.getElementById('pd-stat-franchises').innerText = p.managers.length;

  document.getElementById('pd-season-body').innerHTML = p.season_log.length ? p.season_log.map(s => `
    <tr class="hover:bg-slate-800/40">
      <td class="p-2 font-mono text-slate-400">'${String(s.year).slice(-2)}</td>
      <td class="p-2 text-slate-300">${s.manager}</td>
      <td class="p-2 text-center font-mono">${s.starts}</td>
      <td class="p-2 text-right font-mono font-bold text-emerald-400">${s.starter_pts.toFixed(1)}</td>
    </tr>`).join('') : `<tr><td colspan="4" class="p-2 text-center text-slate-500">No active stats.</td></tr>`;

  document.getElementById('pd-draft-body').innerHTML = p.draft_log.length ? p.draft_log.map(d => `
    <tr class="hover:bg-slate-800/40">
      <td class="p-2 font-mono text-slate-400">'${String(d.year).slice(-2)}</td>
      <td class="p-2 font-mono text-amber-400">Rd ${d.round_num} (#${d.overall_pick})</td>
      <td class="p-2 text-slate-300">${d.manager}</td>
      <td class="p-2 text-center font-mono text-[10px] ${d.is_keeper ? 'text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 rounded px-1' : 'text-slate-500'}">${d.is_keeper ? 'KEEPER' : 'DRAFT'}</td>
    </tr>`).join('') : `<tr><td colspan="4" class="p-2 text-center text-slate-500">Undrafted / FA</td></tr>`;

document.getElementById('pd-trade-body').innerHTML = p.trade_log.length ? p.trade_log.map(t => `
    <tr class="hover:bg-slate-800/40">
      <td class="p-2 font-mono text-slate-400">'${String(t.year).slice(-2)} (Wk ${t.week})</td>
      <td class="p-2 text-rose-400 line-through truncate max-w-[100px]">${t.from_owner}</td>
      <td class="p-2 text-emerald-400 font-bold truncate max-w-[100px]">${t.to_owner}</td>
    </tr>`).join('') : `<tr><td colspan="3" class="p-2 text-center text-slate-500">Never traded.</td></tr>`;

  document.getElementById('player-dossier-modal').classList.remove('hidden');
}

function closePlayerDossier() {
  document.getElementById('player-dossier-modal').classList.add('hidden');
}

// ----------------------------------------------------
// WHAT IF SCHEDULE MACHINE LOGIC
// ----------------------------------------------------
function initWhatIf() {
  const seasonSel = document.getElementById('whatif-season');
  if (!seasonSel || !RAW_DATA) return;

  // Populate seasons only once
  if (seasonSel.options.length === 0) {
    RAW_DATA.years.slice().reverse().forEach(yr => seasonSel.add(new Option(yr, yr)));
  }
  
  updateWhatIfManagers();
}

function updateWhatIfManagers() {
  const yr = parseInt(document.getElementById('whatif-season').value);
  const teamSel = document.getElementById('whatif-team');
  const schedSel = document.getElementById('whatif-schedule');
  if (!teamSel || !schedSel || !RAW_DATA) return;

  // Save current selections to restore them if that manager also played in the newly selected year
  const currTeam = teamSel.value;
  const currSched = schedSel.value;

  teamSel.innerHTML = '';
  schedSel.innerHTML = '';

  // Filter managers to only those active in the selected year
  const activeMgrs = Object.keys(RAW_DATA.manager_profiles).filter(m => 
    RAW_DATA.manager_profiles[m].years_active.includes(yr)
  ).sort();

  activeMgrs.forEach(m => {
    teamSel.add(new Option(m, m));
    schedSel.add(new Option(m, m));
  });

  // Smart restoration: Keep their selection if valid, otherwise pick defaults
  if (activeMgrs.includes(currTeam)) teamSel.value = currTeam;
  else if (activeMgrs.length > 0) teamSel.selectedIndex = 0;

  if (activeMgrs.includes(currSched)) schedSel.value = currSched;
  else if (activeMgrs.length > 1) schedSel.selectedIndex = 1;
  else if (activeMgrs.length > 0) schedSel.selectedIndex = 0;

  renderWhatIf();
}

function renderWhatIf() {
  const yr = parseInt(document.getElementById('whatif-season').value);
  const team = document.getElementById('whatif-team').value;
  const schedTeam = document.getElementById('whatif-schedule').value;
  const container = document.getElementById('whatif-results-container');
  const tb = document.getElementById('whatif-table-body');
  
  if (!RAW_DATA?.matchups || !yr || !team || !schedTeam) return;

  if (team === schedTeam) {
    container.classList.remove('hidden');
    container.classList.add('grid');
    document.getElementById('whatif-new-record').innerText = "Same";
    document.getElementById('whatif-delta').innerText = "Select a different schedule to swap.";
    document.getElementById('whatif-delta').className = "text-sm font-bold text-slate-500 mt-2";
    tb.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">You selected the same manager for both fields.</td></tr>`;
    return;
  }

  // 1. Isolate the regular season games for the selected year
  const regMatchups = RAW_DATA.matchups.filter(m => m.year === yr && m.matchup_type === 'REGULAR');
  
  // 2. Map out "My Team's" actual scores and actual record
  const teamScores = {};
  let actualWins = 0, actualLosses = 0, actualTies = 0;
  regMatchups.forEach(m => {
    if (m.home_owner === team) {
      teamScores[m.week] = m.home_score;
      if (m.home_score > m.away_score) actualWins++;
      else if (m.home_score < m.away_score) actualLosses++;
      else actualTies++;
    } else if (m.away_owner === team) {
      teamScores[m.week] = m.away_score;
      if (m.away_score > m.home_score) actualWins++;
      else if (m.away_score < m.home_score) actualLosses++;
      else actualTies++;
    }
  });

  // 3. Map out the target "Swapped Schedule"
  const swapSchedule = {};
  regMatchups.forEach(m => {
    if (m.home_owner === schedTeam) {
      swapSchedule[m.week] = { opp: m.away_owner, opp_score: m.away_score };
    } else if (m.away_owner === schedTeam) {
      swapSchedule[m.week] = { opp: m.home_owner, opp_score: m.home_score };
    }
  });

  if (Object.keys(teamScores).length === 0 || Object.keys(swapSchedule).length === 0) {
    container.classList.remove('hidden');
    container.classList.add('grid');
    document.getElementById('whatif-new-record').innerText = "N/A";
    document.getElementById('whatif-delta').innerText = "One or both teams didn't play in this season.";
    document.getElementById('whatif-delta').className = "text-sm font-bold text-slate-500 mt-2";
    tb.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-slate-500">Missing data for this season.</td></tr>`;
    return;
  }

  // 4. Calculate the Alternate Reality
  let newWins = 0, newLosses = 0, newTies = 0;
  const htmlRows = [];

  Object.keys(teamScores).sort((a,b) => parseInt(a)-parseInt(b)).forEach(wk => {
    const myScore = teamScores[wk];
    const swapData = swapSchedule[wk];
    if (!swapData) return;
    
    let oppName = swapData.opp;
    let oppScore = swapData.opp_score;
    
    // Paradox Catch: If the swapped schedule has you playing YOURSELF, you actually play the manager whose schedule you stole!
    if (oppName === team) {
        oppName = schedTeam;
        const match = regMatchups.find(m => m.week == wk && (m.home_owner === schedTeam || m.away_owner === schedTeam));
        if (match) {
            oppScore = (match.home_owner === schedTeam) ? match.home_score : match.away_score;
        }
    }

    let result = '', resClass = '';
    if (myScore > oppScore) { newWins++; result = 'W'; resClass = 'text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded'; }
    else if (myScore < oppScore) { newLosses++; result = 'L'; resClass = 'text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded'; }
    else { newTies++; result = 'T'; resClass = 'text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded'; }

    const margin = Math.abs(myScore - oppScore).toFixed(1);

    htmlRows.push(`
      <tr class="hover:bg-slate-800/40">
        <td class="p-2 font-mono text-slate-400">Wk ${wk}</td>
        <td class="p-2 text-right font-mono font-bold text-cyan-400">${myScore.toFixed(1)}</td>
        <td class="p-2 text-center font-black ${resClass}">${result}</td>
        <td class="p-2 text-slate-300 truncate max-w-[120px]">${oppName}</td>
        <td class="p-2 text-right font-mono text-slate-400">${oppScore.toFixed(1)}</td>
        <td class="p-2 text-right font-mono text-slate-500">${margin}</td>
      </tr>
    `);
  });

  // Render Stats
  document.getElementById('whatif-new-record').innerText = `${newWins}-${newLosses}${newTies > 0 ? '-'+newTies : ''}`;
  const winDiff = newWins - actualWins;
  const deltaEl = document.getElementById('whatif-delta');
  
  if (winDiff > 0) {
    deltaEl.innerText = `+${winDiff} Wins vs Actual Record (${actualWins}-${actualLosses})`;
    deltaEl.className = "text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1.5 rounded mt-2";
  } else if (winDiff < 0) {
    deltaEl.innerText = `${winDiff} Wins vs Actual Record (${actualWins}-${actualLosses})`;
    deltaEl.className = "text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2.5 py-1.5 rounded mt-2";
  } else {
    deltaEl.innerText = `Same as Actual Record (${actualWins}-${actualLosses})`;
    deltaEl.className = "text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700 px-2.5 py-1.5 rounded mt-2";
  }

  tb.innerHTML = htmlRows.join('');
  container.classList.remove('hidden');
  container.classList.add('grid');
}

// ----------------------------------------------------
// DRAFT PICK VALUE CURVE CHART
// ----------------------------------------------------
let draftCurveChartInstance = null;

function renderDraftCurveChart() {
  const canvas = document.getElementById('draftCurveCanvas');
  const seasonSel = document.getElementById('draftCurveSeason');
  if (!canvas || !seasonSel || !RAW_DATA?.draft_vault?.drafts_by_season) return;

  // Populate dropdown on first load and default to the most recent season
  if (seasonSel.options.length === 0) {
    seasonSel.add(new Option('All Time', 'ALL'));
    RAW_DATA.years.slice().reverse().forEach(yr => {
      seasonSel.add(new Option(`${yr} Season`, yr));
    });
    // Set default to the latest active year
    if (RAW_DATA.years.length > 0) {
      seasonSel.value = RAW_DATA.years[RAW_DATA.years.length - 1];
    }
  }

  const selectedYr = seasonSel.value;
  const ctx = canvas.getContext('2d');
  if (draftCurveChartInstance) draftCurveChartInstance.destroy();

  const scatterData = [];
  
  // Filter the data based on the dropdown selection
  if (selectedYr === 'ALL') {
    Object.values(RAW_DATA.draft_vault.drafts_by_season).forEach(seasonPicks => {
      seasonPicks.forEach(pick => {
        if (pick.has_played && pick.starter_pts > 0) {
          scatterData.push({ x: pick.overall_pick, y: pick.starter_pts, name: pick.player, manager: pick.owner, year: pick.year });
        }
      });
    });
  } else {
    const yrInt = parseInt(selectedYr);
    const seasonPicks = RAW_DATA.draft_vault.drafts_by_season[yrInt] || [];
    seasonPicks.forEach(pick => {
      if (pick.has_played && pick.starter_pts > 0) {
        scatterData.push({ x: pick.overall_pick, y: pick.starter_pts, name: pick.player, manager: pick.owner, year: pick.year });
      }
    });
  }

  draftCurveChartInstance = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Drafted Players',
        data: scatterData,
        backgroundColor: 'rgba(52, 211, 153, 0.4)', // Tailwind emerald-400 with opacity
        borderColor: 'rgba(52, 211, 153, 0.8)',
        pointRadius: 4,
        pointHoverRadius: 7
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)', // slate-900
          titleColor: '#34d399', // emerald-400
          bodyColor: '#e2e8f0', // slate-200
          borderColor: '#1e293b', // slate-800
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function(context) {
              const pt = context.raw;
              return `${pt.name} ('${String(pt.year).slice(-2)}) - Pick #${pt.x} | ${pt.y.toFixed(1)} pts (${pt.manager})`;
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Overall Draft Pick Number', color: '#94a3b8', font: { weight: 'bold' } },
          ticks: { color: '#64748b' },
          grid: { color: '#1e293b' }
        },
        y: {
          title: { display: true, text: 'Total Starter Points Produced', color: '#94a3b8', font: { weight: 'bold' } },
          ticks: { color: '#64748b' },
          grid: { color: '#1e293b' }
        }
      }
    }
  });
}

// ----------------------------------------------------
// CSV EXPORT UTILITY
// ----------------------------------------------------
function exportTableToCSV(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table) return;

  let csv = [];
  const rows = table.querySelectorAll("tr");

  for (let i = 0; i < rows.length; i++) {
    let row = [], cols = rows[i].querySelectorAll("td, th");

    for (let j = 0; j < cols.length; j++) {
      // Clean up inner text (remove emojis, extra spaces, etc. if desired, or keep as is)
      let data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, " ").trim();
      // Escape double quotes
      data = data.replace(/"/g, '""');
      row.push('"' + data + '"');
    }
    csv.push(row.join(","));
  }

  const csvFile = new Blob([csv.join("\n")], { type: "text/csv" });
  const downloadLink = document.createElement("a");
  downloadLink.download = filename;
  downloadLink.href = window.URL.createObjectURL(csvFile);
  downloadLink.style.display = "none";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}

// ----------------------------------------------------
// DOSSIER ACHIEVEMENT BADGES
// ----------------------------------------------------
function renderDossierBadges(mgrName) {
  const container = document.getElementById('dossier-achievement-badges');
  if (!container || !RAW_DATA) return;

  let badges = [];

  // 1. Draft Master (Hit Rate > 55%)
  if (RAW_DATA.draft_vault && RAW_DATA.draft_vault.manager_roi) {
    const roi = RAW_DATA.draft_vault.manager_roi.find(m => m.manager === mgrName);
    if (roi && roi.hit_rate >= 55) {
      badges.push(`<span class="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" title="Draft Hit Rate of 55% or higher">🎯 Draft Master</span>`);
    }
  }

  // 2. Wheeler & Dealer (Most Trades) & Diamond Hands (Fewest)
  if (RAW_DATA.trades_data) {
    const tradeCounts = {};
    RAW_DATA.trades_data.forEach(t => {
      tradeCounts[t.to_owner] = (tradeCounts[t.to_owner] || 0) + 1;
      tradeCounts[t.from_owner] = (tradeCounts[t.from_owner] || 0) + 1;
    });

    Object.keys(RAW_DATA.manager_profiles).forEach(m => {
      if (!tradeCounts[m]) tradeCounts[m] = 0; // Ensure 0-trade managers are counted
    });

    const maxTrades = Math.max(...Object.values(tradeCounts));
    const minTrades = Math.min(...Object.values(tradeCounts));

    if (tradeCounts[mgrName] === maxTrades && maxTrades > 0) {
      badges.push(`<span class="bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" title="Most lifetime trades executed">🤝 Wheeler & Dealer</span>`);
    } else if (tradeCounts[mgrName] === minTrades) {
      badges.push(`<span class="bg-slate-700/50 text-slate-300 border border-slate-600 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" title="Fewest lifetime trades executed">💎 Diamond Hands</span>`);
    }
  }

  // 3. Cardiac Kid (Most narrow heartbreak losses < 3 pts)
  if (RAW_DATA.matchups) {
    const closeLosses = {};
    RAW_DATA.matchups.forEach(m => {
      if (m.margin < 3 && m.winner_owner !== "TIE") {
        const loser = m.winner_owner === m.home_owner ? m.away_owner : m.home_owner;
        closeLosses[loser] = (closeLosses[loser] || 0) + 1;
      }
    });

    const maxCloseLosses = Math.max(...Object.values(closeLosses), 0);
    if (maxCloseLosses > 0 && closeLosses[mgrName] === maxCloseLosses) {
      badges.push(`<span class="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" title="Most heartbreaking losses by less than 3 points">💔 Cardiac Kid</span>`);
    }
  }

  // 4. Juggernaut (Highest Avg PPG)
  const ppgMap = {};
  Object.keys(RAW_DATA.manager_profiles).forEach(m => {
    const prof = RAW_DATA.manager_profiles[m];
    if (prof.games > 0) ppgMap[m] = prof.points_for / prof.games;
  });
  const maxPPG = Math.max(...Object.values(ppgMap));
  if (ppgMap[mgrName] === maxPPG) {
     badges.push(`<span class="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" title="Highest Career PPG">🔥 Juggernaut</span>`);
  }

// 5. Horseshoe (Most Lucky) & Snakebitten (Most Unlucky)
  let maxLuck = -999, minLuck = 999;
  let luckyMgr = null, unluckyMgr = null;
  Object.keys(RAW_DATA.manager_profiles).forEach(m => {
    const prof = RAW_DATA.manager_profiles[m];
    const luck = prof.wins - prof.expected_wins;
    if (luck > maxLuck) { maxLuck = luck; luckyMgr = m; }
    if (luck < minLuck) { minLuck = luck; unluckyMgr = m; }
  });
  
  if (mgrName === luckyMgr && maxLuck > 0) {
    badges.push(`<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" title="Highest All-Time Luck Rating">🍀 Horseshoe</span>`);
  } else if (mgrName === unluckyMgr && minLuck < 0) {
    badges.push(`<span class="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" title="Lowest All-Time Luck Rating">🌧️ Snakebitten</span>`);
  }

  // 6. Galaxy Brain (Best Start/Sit Efficiency)
  let bestIQ = 999, brainMgr = null;
  Object.keys(RAW_DATA.manager_profiles).forEach(m => {
    const prof = RAW_DATA.manager_profiles[m];
    if (prof.games > 20) { // minimum game threshold
      const iq = prof.points_bench / prof.points_for;
      if (iq < bestIQ) { bestIQ = iq; brainMgr = m; }
    }
  });
  if (mgrName === brainMgr) {
    badges.push(`<span class="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" title="Most efficient manager (lowest points left on bench)">🧠 Galaxy Brain</span>`);
  }

  // 7. The Bully (Most Blowout Wins > 40 pts)
  if (RAW_DATA.matchups) {
    const blowouts = {};
    RAW_DATA.matchups.forEach(m => {
      if (m.margin >= 40 && m.winner_owner !== "TIE") {
        blowouts[m.winner_owner] = (blowouts[m.winner_owner] || 0) + 1;
      }
    });
    const maxBlowouts = Math.max(...Object.values(blowouts), 0);
    if (maxBlowouts > 0 && blowouts[mgrName] === maxBlowouts) {
      badges.push(`<span class="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1" title="Most blowout victories (40+ pt margins)">💥 The Bully</span>`);
    }
  }

  container.innerHTML = badges.join('');
}

// Auto-inject "?" buttons next to all major section headers
setTimeout(() => {
  document.querySelectorAll('section > div > div > h2').forEach(h2 => {
    if (!h2.querySelector('.help-btn')) {
      const btn = document.createElement('button');
      btn.className = "help-btn ml-3 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 border border-slate-700 rounded-full w-6 h-6 inline-flex items-center justify-center text-[12px] font-bold transition focus:outline-none";
      btn.innerText = "?";
      btn.title = "View Page Definitions";
      btn.onclick = (e) => {
        e.stopPropagation();
        const section = h2.closest('section');
        if (section) {
          const viewId = section.id.replace('view-', '');
          openPageHelp(viewId);
        }
      };
      h2.appendChild(btn);
    }
  });
}, 500);

// Close modal on escape key or outside click
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePageHelp(); });
document.addEventListener('click', (e) => {
  const hm = document.getElementById('page-help-modal');
  if (hm && !hm.classList.contains('hidden') && e.target === hm) closePageHelp();
});

// Auto-inject hover tooltips for complex column headers
setTimeout(() => {
  const COLUMN_TOOLTIPS = {
    // Standings & Simulator
    "Expected Record": "What your record would be if you played every team every week (All-Play).",
    "Luck Rating": "Actual Wins minus Expected Wins. Positive means an easy schedule!",
    "Baseline Record": "Current regular season record.",
    "Proj Record": "Projected final regular season record based on 10,000 simulations.",
    "Proj PF": "Projected final Points For.",
    "#1 Seed %": "Odds of securing the number one overall seed.",
    "Top 2 Bye %": "Odds of securing a first-round playoff bye.",
    "Make Playoffs %": "Odds of making the playoffs (Top 6).",
    "Toilet Bowl %": "Odds of missing the playoffs entirely.",
    
    // Draft Vault & Keepers
    "Hit Rate %": "Percentage of drafted players who started 6+ games for this manager.",
    "Rds 1-3 Hit Rate": "Hit rate specifically for premium players drafted in Rounds 1-3.",
    "Avg Started Pts/Pick": "Average starting lineup points produced per drafted player.",
    "Signature Draft Steal": "The best late-round pick (Round 6+) based on starter points.",
    "Started Points": "Total points this player produced while in a starting lineup spot.",
    "Total Points": "Total points this player produced (including bench points).",
    "Tenure": "Number of seasons this player has been kept or rostered.",
    "Tenure Years": "The specific years this player was on the roster.",
    
    // Efficiency & Positions
    "Avg Starter PPG": "Average points scored by the starting lineup.",
    "Avg Bench PPG": "Average points left on the bench.",
    "Bench-to-Starter Ratio": "Ratio of bench points to starter points. Lower means fewer points wasted on the bench.",
    "QB PPG": "Average starting points per game from Quarterbacks.",
    "RB PPG": "Average starting points per game from Running Backs.",
    "WR PPG": "Average starting points per game from Wide Receivers.",
    "TE PPG": "Average starting points per game from Tight Ends.",
    "K & D/ST PPG": "Average starting points per game from Kickers and Defenses.",
    "Total Starter PPG": "Average points per game from the entire starting lineup.",
    
    // Streaks, Finishes & Bad Beats
    "Podium Rate": "Percentage of seasons finishing in 1st, 2nd, or 3rd place.",
    "Max Win Streak": "Longest consecutive winning streak.",
    "Max Loss Skid": "Longest consecutive losing streak.",
    "Active Streak": "Current consecutive wins or losses.",
    "Last 5 Games": "Results from the most recent 5 matchups.",
    "Pain Index": "Weighted score: 130+ pt losses (3x) + <3 pt losses (2x) + goose eggs (1.5x).",
    "Losses ≥ 130 pts": "Number of times a manager lost despite scoring 130 or more points.",
    "Nail-Biters (< 3 pts)": "Number of times a manager lost by less than 3 points.",
    "Starter Goose Eggs": "Number of times a starting player scored 0 or negative points.",
    
    // Trades
    "Pts Produced": "Total points produced for the new manager post-trade.",
    "Post-Trade Output": "Total points produced for the new manager post-trade."
  };

  document.querySelectorAll('th').forEach(th => {
    const headerText = th.innerText.trim();
    if (COLUMN_TOOLTIPS[headerText]) {
      th.title = COLUMN_TOOLTIPS[headerText];
      th.classList.add('cursor-help'); // Changes the mouse pointer to a '?' when hovering over the word
    }
  });
}, 500);