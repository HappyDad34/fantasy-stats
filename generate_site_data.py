import sqlite3
import json
import numpy as np
import pandas as pd

class NpEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (np.bool_, bool)):
            return bool(obj)
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

conn = sqlite3.connect("league_history.db")
cursor = conn.cursor()

# Safely check which tables exist
existing_tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]

df_matchups = pd.read_sql_query("SELECT * FROM matchups", conn) if "matchups" in existing_tables else pd.DataFrame()
df_teams_hist = pd.read_sql_query("SELECT * FROM teams_history", conn) if "teams_history" in existing_tables else pd.DataFrame()
df_players = pd.read_sql_query("SELECT * FROM player_box_scores", conn) if "player_box_scores" in existing_tables else pd.DataFrame()
df_trans = pd.read_sql_query("SELECT * FROM transactions WHERE trans_type = 'TRADE_ACCEPT'", conn) if "transactions" in existing_tables else pd.DataFrame()
df_draft = pd.read_sql_query("SELECT * FROM draft_picks", conn) if "draft_picks" in existing_tables else pd.DataFrame()

conn.close()

# -------------------------------------------------------------------------
# CRITICAL FIX: Filter out unplayed matchups (0-0 scores or active 2026 unplayed games)
# -------------------------------------------------------------------------
CURRENT_ACTIVE_SEASON = 2026
if not df_matchups.empty:
    # Drop rows where both home and away scores are 0 (unplayed games)
    df_matchups = df_matchups[~((df_matchups['home_score'] == 0) & (df_matchups['away_score'] == 0))]
    
    # Exclude the current ongoing/unplayed season from historical aggregations, streaks, narratives, and simulations
    df_historical_matchups = df_matchups[df_matchups['year'] != CURRENT_ACTIVE_SEASON]
else:
    df_historical_matchups = pd.DataFrame()


def normalize_matchup_type(val):
    v = str(val).upper().strip()
    if v in ['REGULAR', 'REG', 'NONE', '', 'NAN']:
        return 'REGULAR'
    if 'LOSER' in v or 'CONSOLATION' in v or 'LADDER' in v or 'TOILET' in v:
        return 'CONSOLATION'
    if 'WINNER' in v or 'PLAYOFF' in v or 'CHAMPIONSHIP' in v:
        return 'PLAYOFF'
    return 'REGULAR'

if not df_matchups.empty:
    df_matchups['matchup_type'] = df_matchups['matchup_type'].apply(normalize_matchup_type)

matchup_type_map = {}
if not df_matchups.empty:
    for _, row in df_matchups.iterrows():
        matchup_type_map[(int(row['year']), int(row['week']), str(row['home_owner']).strip())] = row['matchup_type']
        matchup_type_map[(int(row['year']), int(row['week']), str(row['away_owner']).strip())] = row['matchup_type']

# Robust Years Extraction (restrict completed historical years to those before 2026 or with actual results)
years_m = [int(y) for y in df_historical_matchups["year"].dropna().unique()] if not df_historical_matchups.empty else []
years_t = [int(y) for y in df_teams_hist["year"].dropna().unique() if int(y) < CURRENT_ACTIVE_SEASON] if not df_teams_hist.empty else []
years_p = [int(y) for y in df_players["year"].dropna().unique() if int(y) < CURRENT_ACTIVE_SEASON] if not df_players.empty else []

all_years = sorted(list(set(years_m + years_t + years_p)))
if not all_years:
    all_years = list(range(2017, CURRENT_ACTIVE_SEASON))

# Allow active/current seasons to be included in draft and keeper parsing 
# even if historical matchup games are filtered out.
draft_allowed_years = sorted(list(set(all_years + [CURRENT_ACTIVE_SEASON])))
if not draft_allowed_years:
    draft_allowed_years = list(range(2017, CURRENT_ACTIVE_SEASON))

manager_profiles = {}
if not df_teams_hist.empty:
    for owner_name, group in df_teams_hist.groupby("owner_name"):
        unique_names = group["team_name"].unique().tolist()
        latest_name = group.sort_values(by="year", ascending=False).iloc[0]["team_name"]
        years_active = sorted(group["year"].unique().tolist())

        aliases_with_years = []
        for name in unique_names:
            years_used = group[group["team_name"] == name]["year"].tolist()
            if len(years_used) == 1:
                aliases_with_years.append(f"{name} ('{str(years_used[0])[-2:]})")
            else:
                aliases_with_years.append(f"{name} ('{str(min(years_used))[-2:]}-'{str(max(years_used))[-2:]})")

        manager_profiles[owner_name] = {
            "manager_name": owner_name,
            "latest_team_name": latest_name,
            "years_active": [int(y) for y in years_active],
            "all_aliases": aliases_with_years
        }

bench_slots = {'BE', 'IR', 'O', 'Taxi'}
roster_weekly = []
weekly_top_players = {}
cornerstones = []
goose_eggs = []
player_seasons = []

if not df_players.empty:
    df_players['position'] = df_players['position'].replace({'DEF': 'D/ST'})

    for (year, week, owner), group in df_players.groupby(['year', 'week', 'owner_name']):
        starters = group[~group['slot_position'].isin(bench_slots)]
        bench = group[group['slot_position'].isin(bench_slots)]

        start_pts = float(starters['points'].sum())
        bench_pts = float(bench['points'].sum())

        pos_series = starters['position']
        qb_pts = float(starters[pos_series == 'QB']['points'].sum())
        rb_pts = float(starters[pos_series == 'RB']['points'].sum())
        wr_pts = float(starters[pos_series == 'WR']['points'].sum())
        te_pts = float(starters[pos_series == 'TE']['points'].sum())
        k_def_pts = float(starters[pos_series.isin(['K', 'D/ST'])]['points'].sum())

        m_type = matchup_type_map.get((int(year), int(week), str(owner).strip()), 'REGULAR')

        roster_weekly.append({
            "year": int(year),
            "week": int(week),
            "owner": owner,
            "matchup_type": m_type,
            "start_pts": round(start_pts, 2),
            "bench_pts": round(bench_pts, 2),
            "qb_pts": round(qb_pts, 2),
            "rb_pts": round(rb_pts, 2),
            "wr_pts": round(wr_pts, 2),
            "te_pts": round(te_pts, 2),
            "k_def_pts": round(k_def_pts, 2)
        })

    starters_df = df_players[~df_players['slot_position'].isin(bench_slots)]
    goose_df = starters_df[starters_df['points'] <= 0.0]
    for _, g in goose_df.iterrows():
        m_type = matchup_type_map.get((int(g['year']), int(g['week']), str(g['owner_name']).strip()), 'REGULAR')
        goose_eggs.append({
            "year": int(g['year']),
            "week": int(g['week']),
            "owner": g['owner_name'],
            "team": g['team_name'],
            "player": g['player_name'],
            "pos": g['position'],
            "slot": g['slot_position'],
            "points": round(float(g['points']), 2),
            "matchup_type": m_type
        })

    for (year, week), group in df_players.groupby(['year', 'week']):
        key = f"{year}_{week}"
        top_group = group.sort_values(by='points', ascending=False).head(15)

        player_list = []
        for _, p in top_group.iterrows():
            is_starter = bool(p['slot_position'] not in bench_slots)
            player_list.append({
                "name": p['player_name'],
                "pos": p['position'],
                "points": round(float(p['points']), 2),
                "owner": p['owner_name'],
                "slot": p['slot_position'],
                "is_starter": is_starter
            })

        bench_group = group[group['slot_position'].isin(bench_slots)].sort_values(by='points', ascending=False)
        bench_blunder = None
        if not bench_group.empty:
            b_top = bench_group.iloc[0]
            bench_blunder = {
                "name": b_top['player_name'],
                "pos": b_top['position'],
                "points": round(float(b_top['points']), 2),
                "owner": b_top['owner_name'],
                "slot": b_top['slot_position']
            }

        lineups_by_owner = {}
        for owner_name, o_group in group.groupby('owner_name'):
            starters_list = []
            bench_list = []
            for _, p in o_group.iterrows():
                is_starter = bool(p['slot_position'] not in bench_slots)
                item = {
                    "name": p['player_name'],
                    "pos": p['position'],
                    "slot": p['slot_position'],
                    "points": round(float(p['points']), 2)
                }
                if is_starter:
                    starters_list.append(item)
                else:
                    bench_list.append(item)

            lineups_by_owner[owner_name] = {
                "starters": starters_list,
                "bench": bench_list,
                "total_starter_pts": round(float(sum(p['points'] for p in starters_list)), 2),
                "total_bench_pts": round(float(sum(p['points'] for p in bench_list)), 2)
            }

        weekly_top_players[key] = {
            "top_performers": player_list,
            "bench_blunder": bench_blunder,
            "lineups": lineups_by_owner
        }

    for (owner, player_name), p_group in df_players.groupby(['owner_name', 'player_name']):
        years = sorted(p_group['year'].unique().tolist())
        starters = p_group[~p_group['slot_position'].isin(bench_slots)]

        total_pts = float(p_group['points'].sum())
        starter_pts = float(starters['points'].sum())
        starter_games = len(starters)
        total_games = len(p_group)
        pos = p_group['position'].iloc[0]

        cornerstones.append({
            "owner": owner,
            "player": player_name,
            "pos": pos,
            "seasons": int(len(years)),
            "years_list": [int(y) for y in years],
            "years_display": ", ".join([f"'{str(y)[-2:]}" for y in years]),
            "starter_games": int(starter_games),
            "total_games": int(total_games),
            "starter_pts": round(starter_pts, 1),
            "total_pts": round(total_pts, 1),
            "starter_ppg": round(starter_pts / starter_games, 1) if starter_games > 0 else 0.0
        })

    for (year, owner, player_name), ps_group in df_players.groupby(['year', 'owner_name', 'player_name']):
        starters = ps_group[~ps_group['slot_position'].isin(bench_slots)]
        starter_pts = float(starters['points'].sum())
        total_pts = float(ps_group['points'].sum())
        starter_games = len(starters)
        pos = ps_group['position'].iloc[0]

        if starter_pts > 0 or total_pts > 0:
            player_seasons.append({
                "year": int(year),
                "player": player_name,
                "pos": pos,
                "owner": owner,
                "starter_pts": round(starter_pts, 1),
                "total_pts": round(total_pts, 1),
                "starts": int(starter_games),
                "ppg": round(starter_pts / starter_games, 1) if starter_games > 0 else 0.0
            })

# 4. Streaks Data (Calculated strictly on historical completed matchups)
streaks_data = {}
if not df_historical_matchups.empty:
    df_sorted_match = df_historical_matchups.sort_values(by=['year', 'week']).copy()
    
    for manager in manager_profiles.keys():
        mgr_matches = df_sorted_match[(df_sorted_match['home_owner'] == manager) | (df_sorted_match['away_owner'] == manager)]
        results = []
        for _, row in mgr_matches.iterrows():
            won = bool(row['winner_owner'] == manager)
            tied = bool(row['winner_owner'] in ['TIE', '0'])
            score = row['home_score'] if row['home_owner'] == manager else row['away_score']
            opp_score = row['away_score'] if row['home_owner'] == manager else row['home_score']
            opp = row['away_owner'] if row['home_owner'] == manager else row['home_owner']

            outcome = 'T' if tied else ('W' if won else 'L')
            results.append({
                'year': int(row['year']),
                'week': int(row['week']),
                'type': row['matchup_type'],
                'outcome': outcome,
                'score': float(score),
                'opp_score': float(opp_score),
                'opp': opp,
                'margin': float(row['margin'])
            })

        max_w, cur_w, max_l, cur_l = 0, 0, 0, 0
        for r in results:
            if r['outcome'] == 'W':
                cur_w += 1
                cur_l = 0
                if cur_w > max_w:
                    max_w = cur_w
            elif r['outcome'] == 'L':
                cur_l += 1
                cur_w = 0
                if cur_l > max_l:
                    max_l = cur_l
            else:
                cur_w, cur_l = 0, 0

        active_type = results[-1]['outcome'] if results else 'N/A'
        active_count = 0
        if results:
            for r in reversed(results):
                if r['outcome'] == active_type:
                    active_count += 1
                else:
                    break

        last_5 = [r['outcome'] for r in results[-5:]] if len(results) >= 5 else [r['outcome'] for r in results]

        streaks_data[manager] = {
            'manager': manager,
            'longest_win_streak': int(max_w),
            'longest_loss_streak': int(max_l),
            'active_type': active_type,
            'active_count': int(active_count),
            'last_5': last_5,
            'total_games': int(len(results))
        }

# 5. Season Narratives (Completed historical seasons only)
season_narratives = {}
if not df_historical_matchups.empty:
    for yr in all_years:
        yr_matches = df_historical_matchups[df_historical_matchups['year'] == yr]
        yr_reg = yr_matches[yr_matches['matchup_type'] == 'REGULAR']
        if yr_reg.empty:
            continue

        season_stats = {}
        for _, row in yr_reg.iterrows():
            h, a = row['home_owner'], row['away_owner']
            for o, s, opp_s in [(h, row['home_score'], row['away_score']), (a, row['away_score'], row['home_score'])]:
                if o not in season_stats:
                    season_stats[o] = {'owner': o, 'wins': 0, 'losses': 0, 'pf': 0.0, 'pa': 0.0, 'games': 0, 'exp_wins': 0.0, 'close_wins': 0, 'close_losses': 0}
                season_stats[o]['games'] += 1
                season_stats[o]['pf'] += float(s)
                season_stats[o]['pa'] += float(opp_s)
                if s > opp_s:
                    season_stats[o]['wins'] += 1
                    if abs(s - opp_s) < 5.0:
                        season_stats[o]['close_wins'] += 1
                elif s < opp_s:
                    season_stats[o]['losses'] += 1
                    if abs(s - opp_s) < 5.0:
                        season_stats[o]['close_losses'] += 1

        for wk, wk_group in yr_reg.groupby('week'):
            scores = []
            for _, r in wk_group.iterrows():
                scores.append((r['home_owner'], r['home_score']))
                scores.append((r['away_owner'], r['away_score']))
            for i in range(len(scores)):
                for j in range(len(scores)):
                    if i != j and scores[i][0] in season_stats:
                        if scores[i][1] > scores[j][1]:
                            season_stats[scores[i][0]]['exp_wins'] += 1.0 / (len(scores) - 1)

        stat_list = list(season_stats.values())
        if not stat_list:
            continue

        stat_list.sort(key=lambda x: (x['wins'] - x['exp_wins']), reverse=True)
        overachiever = stat_list[0]
        underachiever = stat_list[-1]
        juggernaut = sorted(stat_list, key=lambda x: x['pf'], reverse=True)[0]
        iron_curtain = sorted(stat_list, key=lambda x: x['pa'])[0]
        cardiac = sorted(stat_list, key=lambda x: x['close_wins'], reverse=True)[0]
        heartbreak = sorted(stat_list, key=lambda x: x['close_losses'], reverse=True)[0]

        season_narratives[int(yr)] = {
            'overachiever': { 'owner': overachiever['owner'], 'wins': int(overachiever['wins']), 'exp_wins': round(float(overachiever['exp_wins']), 1), 'diff': round(float(overachiever['wins'] - overachiever['exp_wins']), 1) },
            'underachiever': { 'owner': underachiever['owner'], 'wins': int(underachiever['wins']), 'exp_wins': round(float(underachiever['exp_wins']), 1), 'diff': round(float(underachiever['wins'] - underachiever['exp_wins']), 1) },
            'juggernaut': { 'owner': juggernaut['owner'], 'pf': round(float(juggernaut['pf']), 1), 'ppg': round(float(juggernaut['pf']) / juggernaut['games'], 1) if juggernaut['games'] > 0 else 0.0 },
            'iron_curtain': { 'owner': iron_curtain['owner'], 'pa': round(float(iron_curtain['pa']), 1), 'ppg': round(float(iron_curtain['pa']) / iron_curtain['games'], 1) if iron_curtain['games'] > 0 else 0.0 },
            'cardiac': { 'owner': cardiac['owner'], 'close_wins': int(cardiac['close_wins']) },
            'heartbreak': { 'owner': heartbreak['owner'], 'close_losses': int(heartbreak['close_losses']) },
            'regular_standings': sorted(stat_list, key=lambda x: (x['wins'], x['pf']), reverse=True)
        }

# 6. Playoff Brackets (Structured Tournament Elimination)
brackets_by_season = {}
if not df_historical_matchups.empty:
    for yr in all_years:
        yr_matches = df_historical_matchups[df_historical_matchups['year'] == yr]
        
        yr_narrative = season_narratives.get(int(yr))
        if yr_narrative and 'regular_standings' in yr_narrative:
            playoff_owners = [s['owner'] for s in yr_narrative['regular_standings'][:6]]
        else:
            playoff_owners = []

        playoff_matches = []
        consol_matches = []

        for _, m in yr_matches.iterrows():
            is_postseason = False
            wk = int(m['week'])
            
            if int(yr) <= 2020 and wk >= 14:
                is_postseason = True
            elif int(yr) > 2020 and wk >= 15:
                is_postseason = True
                
            if m['matchup_type'] in ['PLAYOFF', 'CONSOLATION']:
                is_postseason = True
                
            if is_postseason:
                if playoff_owners:
                    if m['home_owner'] in playoff_owners or m['away_owner'] in playoff_owners:
                        playoff_matches.append(m)
                    else:
                        consol_matches.append(m)
                else:
                    if m['matchup_type'] == 'PLAYOFF':
                        playoff_matches.append(m)
                    else:
                        consol_matches.append(m)

        playoff_df = pd.DataFrame(playoff_matches) if playoff_matches else pd.DataFrame()
        consol_df = pd.DataFrame(consol_matches) if consol_matches else pd.DataFrame()

        def structure_bracket(matches_df, is_championship=True):
            if matches_df.empty: return []
            weeks = sorted(matches_df['week'].unique().tolist())
            rounds = []
            
            round1_losers = set()

            for idx, wk in enumerate(weeks):
                wk_matches = matches_df[matches_df['week'] == wk]
                match_list = []

                for _, m in wk_matches.iterrows():
                    h_own, a_own = m['home_owner'], m['away_owner']
                    winner = m['winner_owner']
                    loser = a_own if winner == h_own else h_own

                    # If this is Round 1 (Quarterfinals), record who lost so we can filter them out of Semis/Champs
                    if idx == 0 and is_championship:
                        if winner and winner not in ['TIE', '0']:
                            round1_losers.add(loser)

                    # If this is Round 2 (Semifinals) or Round 3, block Round 1 losers from appearing in the main bracket tree
                    if idx > 0 and is_championship:
                        if h_own in round1_losers or a_own in round1_losers:
                            continue # Skip early round losers from leaking into Semifinals/Championship columns

                    match_list.append({
                        'home_owner': h_own,
                        'home_team': m['home_team_name'],
                        'home_score': float(m['home_score']),
                        'away_owner': a_own,
                        'away_team': m['away_team_name'],
                        'away_score': float(m['away_score']),
                        'winner_owner': winner,
                        'margin': float(m['margin']),
                        'week': int(wk),
                        'year': int(yr)
                    })

                if not match_list:
                    continue

                if len(weeks) == 3:
                    r_name = "Quarterfinals (Rd 1)" if idx == 0 else ("Semifinals (Rd 2)" if idx == 1 else "Championship & Podium Games")
                elif len(weeks) == 2:
                    r_name = "Semifinals (Rd 1)" if idx == 0 else "Championship Finals"
                else:
                    r_name = f"Postseason Round {idx + 1}"

                rounds.append({'round_name': r_name, 'week': int(wk), 'matches': match_list})
            return rounds

        brackets_by_season[int(yr)] = {
            'playoff_rounds': structure_bracket(playoff_df, is_championship=True),
            'consolation_rounds': structure_bracket(consol_df, is_championship=False)
        }

# 7. Trades Data (Strictly Filtered by Official League Trade Transactions)
trades_data = []

if not df_trans.empty and not df_players.empty:
    # Filter only accepted trades from the transaction log
    valid_trans = df_trans[df_trans['trans_type'] == 'TRADE_ACCEPT'].copy()
    
    # Pre-calculate player performance by year/name for quick lookup
    player_perf = {}
    for (year, p_name), p_group in df_players.groupby(['year', 'player_name']):
        starters = p_group[~p_group['slot_position'].isin(bench_slots)]
        player_perf[(int(year), str(p_name).strip().lower())] = {
            'starter_pts': float(starters['points'].sum()),
            'starts': len(starters),
            'pos': str(p_group['position'].iloc[0])
        }

    for _, row in valid_trans.iterrows():
        yr = int(row['year'])
        wk = int(row['week'])
        player_name = str(row.get('player_name', '')).strip()
        to_owner = str(row.get('to_owner', '')).strip()
        from_owner = str(row.get('from_owner', '')).strip()
        
        # Look up player stats for that season
        perf = player_perf.get((yr, player_name.lower()), {'starter_pts': 0.0, 'starts': 0, 'pos': 'FLEX'})
        
        trades_data.append({
            'year': yr,
            'week': wk,
            'player': player_name,
            'pos': perf['pos'],
            'from_owner': from_owner,
            'to_owner': to_owner,
            'pts_produced': round(perf['starter_pts'], 1),
            'starts': perf['starts']
        })

# Sort descending by year and week
trades_data = sorted(trades_data, key=lambda x: (x['year'], x['week']), reverse=True)

# 8. DRAFT VAULT & TRUE KEEPERS
draft_vault_payload = {
    'steals': [],
    'busts': [],
    'manager_draft_roi': [],
    'drafts_by_season': {},
    'round_mvps': []
}
true_keepers = []

if not df_draft.empty:
    season_games_count = {}
    for yr in all_years:
        yr_p_df = df_players[df_players['year'] == yr] if not df_players.empty else pd.DataFrame()
        total_pts = float(yr_p_df['points'].sum()) if not yr_p_df.empty else 0.0
        season_games_count[int(yr)] = bool(total_pts > 500.0)

    perf_by_name = {}
    perf_by_id = {}

    if not df_players.empty:
        for (year, player), p_group in df_players.groupby(['year', 'player_name']):
            starters = p_group[~p_group['slot_position'].isin(bench_slots)]
            perf_by_name[(int(year), str(player).strip().lower())] = {
                'starter_pts': round(float(starters['points'].sum()), 1),
                'total_pts': round(float(p_group['points'].sum()), 1),
                'starts': int(len(starters)),
                'games': int(len(p_group)),
                'pos': str(p_group['position'].iloc[0])
            }

        for (year, p_id), p_group in df_players.groupby(['year', 'player_id']):
            if p_id and int(p_id) > 0:
                starters = p_group[~p_group['slot_position'].isin(bench_slots)]
                perf_by_id[(int(year), int(p_id))] = {
                    'starter_pts': round(float(starters['points'].sum()), 1),
                    'total_pts': round(float(p_group['points'].sum()), 1),
                    'starts': int(len(starters)),
                    'games': int(len(p_group)),
                    'pos': str(p_group['position'].iloc[0])
                }

    all_draft_picks_enriched = []
    manager_roi_agg = {}

    for _, row in df_draft.iterrows():
        yr = int(row['year'])
        owner = str(row['owner_name']).strip()
        player = str(row['player_name']).strip()
        p_id = int(row.get('player_id', 0) or 0)
        r_num = int(row['round_num'])
        overall = int(row['overall_pick'])
        bid = int(row.get('bid_amount', 0) or 0)
        is_keeper = bool(row.get('keeper', 0))

        perf = perf_by_id.get((yr, p_id)) or perf_by_name.get((yr, player.lower())) or {
            'starter_pts': 0.0,
            'total_pts': 0.0,
            'starts': 0,
            'games': 0,
            'pos': 'FLEX'
        }

        starter_pts = float(perf['starter_pts'])
        total_pts = float(perf['total_pts'])
        starts = int(perf['starts'])
        pos = str(perf['pos'])
        has_played_season = bool(season_games_count.get(yr, False))

        pick_record = {
            'year': int(yr),
            'round_num': int(r_num),
            'round_pick': int(row['round_pick']),
            'overall_pick': int(overall),
            'owner': owner,
            'team': str(row['team_name']),
            'player': player,
            'pos': pos,
            'bid_amount': int(bid),
            'starter_pts': starter_pts,
            'total_pts': total_pts,
            'starts': starts,
            'has_played': has_played_season,
            'is_keeper': is_keeper
        }

        all_draft_picks_enriched.append(pick_record)

        if is_keeper:
            true_keepers.append({
                'year': int(yr),
                'owner': owner,
                'team': str(row['team_name']),
                'player': player,
                'pos': pos,
                'round_num': int(r_num),
                'overall_pick': int(overall),
                'starter_pts': starter_pts,
                'starts': starts
            })

        if has_played_season:
            if owner not in manager_roi_agg:
                manager_roi_agg[owner] = {
                    'manager': owner,
                    'total_picks': 0,
                    'hits': 0,
                    'total_starter_pts': 0.0,
                    'early_picks': 0,
                    'early_hits': 0,
                    'best_steal': None,
                    'worst_bust': None
                }

            m_stat = manager_roi_agg[owner]
            m_stat['total_picks'] += 1
            m_stat['total_starter_pts'] += starter_pts
            if starts >= 6 or starter_pts >= 80.0:
                m_stat['hits'] += 1

            if r_num <= 3:
                m_stat['early_picks'] += 1
                if starter_pts >= 120.0 or starts >= 8:
                    m_stat['early_hits'] += 1

            if r_num >= 6 and starter_pts >= 80.0:
                if not m_stat['best_steal'] or starter_pts > m_stat['best_steal']['starter_pts']:
                    m_stat['best_steal'] = pick_record

            if r_num <= 2 and starts <= 6:
                if not m_stat['worst_bust'] or starter_pts < m_stat['worst_bust']['starter_pts']:
                    m_stat['worst_bust'] = pick_record

    steals = [p for p in all_draft_picks_enriched if p['has_played'] and p['round_num'] >= 6 and p['starter_pts'] >= 80.0]
    steals.sort(key=lambda x: (x['starter_pts'], x['overall_pick']), reverse=True)

    busts = [p for p in all_draft_picks_enriched if p['has_played'] and p['round_num'] <= 3 and p['starts'] <= 6 and p['starter_pts'] < 80.0]
    busts.sort(key=lambda x: (x['starter_pts'], -x['overall_pick']))

    manager_roi_list = []
    for owner, m_stat in manager_roi_agg.items():
        if m_stat['total_picks'] > 0:
            hit_rate = round(float(m_stat['hits'] / m_stat['total_picks']) * 100, 1)
            early_hit_rate = round(float(m_stat['early_hits'] / m_stat['early_picks'] * 100), 1) if m_stat['early_picks'] > 0 else 0.0
            avg_pts_per_pick = round(float(m_stat['total_starter_pts'] / m_stat['total_picks']), 1)

            manager_roi_list.append({
                'manager': owner,
                'total_picks': int(m_stat['total_picks']),
                'hit_rate': hit_rate,
                'early_hit_rate': early_hit_rate,
                'avg_pts_per_pick': avg_pts_per_pick,
                'best_steal': m_stat['best_steal'],
                'worst_bust': m_stat['worst_bust']
            })

    manager_roi_list.sort(key=lambda x: (x['hit_rate'], x['avg_pts_per_pick']), reverse=True)

    drafts_by_season = {}
    for yr in draft_allowed_years:
        season_picks = [p for p in all_draft_picks_enriched if p['year'] == yr]
        if season_picks:
            season_picks.sort(key=lambda x: x['overall_pick'])
            drafts_by_season[int(yr)] = season_picks

    round_mvps = []
    for r_num in range(1, 18):
        round_picks = [p for p in all_draft_picks_enriched if p['round_num'] == r_num and p['has_played']]
        if round_picks:
            top_pick = max(round_picks, key=lambda x: x['starter_pts'])
            if top_pick['starter_pts'] > 0:
                round_mvps.append(top_pick)

    draft_vault_payload = {
        'steals': steals[:30],
        'busts': busts[:30],
        'manager_draft_roi': manager_roi_list,
        'drafts_by_season': drafts_by_season,
        'round_mvps': round_mvps
    }

# 9. PLAYER DIRECTORY & CAREER SEARCH
player_directory = {}
player_lookup_by_lower = {}

if not df_players.empty:
    for p_name, p_group in df_players.groupby("player_name"):
        clean_name = str(p_name).strip()
        if clean_name in ["Unknown Player", "", "nan", "None"]:
            continue
        
        pos = str(p_group["position"].iloc[0])
        starters = p_group[~p_group["slot_position"].isin(bench_slots)]
        
        starter_pts = float(starters["points"].sum())
        total_pts = float(p_group["points"].sum())
        starts = len(starters)
        games = len(p_group)
        managers = list(p_group["owner_name"].dropna().unique())
        
        season_log = []
        for (yr, mgr), sp_group in p_group.groupby(["year", "owner_name"]):
            s_stars = sp_group[~sp_group["slot_position"].isin(bench_slots)]
            season_log.append({
                "year": int(yr),
                "manager": str(mgr).strip(),
                "starts": int(len(s_stars)),
                "games": int(len(sp_group)),
                "starter_pts": round(float(s_stars["points"].sum()), 1),
                "total_pts": round(float(sp_group["points"].sum()), 1)
            })
        season_log.sort(key=lambda x: x["year"], reverse=True)
        
        p_obj = {
            "name": clean_name,
            "pos": pos,
            "starter_pts": round(starter_pts, 1),
            "total_pts": round(total_pts, 1),
            "starts": starts,
            "games": games,
            "managers": [str(m).strip() for m in managers],
            "season_log": season_log,
            "draft_log": [],
            "trade_log": []
        }
        
        player_directory[clean_name] = p_obj
        player_lookup_by_lower[clean_name.lower()] = p_obj

if not df_draft.empty:
    for _, d in df_draft.iterrows():
        clean_name = str(d.get('player_name', '')).strip()
        p_obj = player_lookup_by_lower.get(clean_name.lower())
        
        if not p_obj and clean_name not in ["Unknown Player", "", "nan", "None"]:
            p_obj = {
                "name": clean_name,
                "pos": "FLEX",
                "starter_pts": 0.0,
                "total_pts": 0.0,
                "starts": 0,
                "games": 0,
                "managers": [str(d.get('owner_name', '')).strip()],
                "season_log": [],
                "draft_log": [],
                "trade_log": []
            }
            player_directory[clean_name] = p_obj
            player_lookup_by_lower[clean_name.lower()] = p_obj
            
        if p_obj:
            p_obj["draft_log"].append({
                "year": int(d["year"]),
                "round_num": int(d["round_num"]),
                "overall_pick": int(d["overall_pick"]),
                "manager": str(d.get("owner_name", "")).strip(),
                "bid_amount": int(d.get("bid_amount", 0) or 0),
                "is_keeper": bool(d.get("keeper", 0))
            })

for t in trades_data:
    clean_name = str(t.get('player', '')).strip()
    p_obj = player_lookup_by_lower.get(clean_name.lower())
    if p_obj:
        exists = any(
            x['year'] == int(t['year']) and x['week'] == int(t['week']) and x['to_owner'] == str(t['to_owner']).strip()
            for x in p_obj["trade_log"]
        )
        if not exists:
            p_obj["trade_log"].append({
                "year": int(t["year"]),
                "week": int(t["week"]),
                "from_owner": str(t.get("from_owner", "")).strip(),
                "to_owner": str(t.get("to_owner", "")).strip(),
                "pts_produced": float(t.get("pts_produced", 0.0))
            })
            if str(t.get("to_owner", "")).strip() not in p_obj["managers"]:
                p_obj["managers"].append(str(t.get("to_owner", "")).strip())

for p in player_directory.values():
    p["draft_log"].sort(key=lambda x: x["year"], reverse=True)
    p["trade_log"].sort(key=lambda x: (x["year"], x["week"]), reverse=True)

player_directory_list = sorted(list(player_directory.values()), key=lambda x: (x["starter_pts"], x["starts"]), reverse=True)


# 9.1 CORNERSTONE PLAYERS EXTRACTION (Per-Season 7+ Week Minimum Tenure)
cornerstone_payload = []

if not df_players.empty:
    for (owner, p_name), p_group in df_players.groupby(["owner_name", "player_name"]):
        if owner in [None, "None", "nan", ""]: continue
        clean_name = str(p_name).strip()
        if clean_name in ["Unknown Player", "", "nan", "None"]: continue
        
        roster_entries = p_group.sort_values(by=["year", "week"])
        if roster_entries.empty: continue
        
        valid_seasons = []
        total_roster_weeks_all = 0
        total_starter_games = 0
        total_starter_pts = 0.0
        
        for yr, yr_group in roster_entries.groupby("year"):
            weeks_in_season = len(yr_group)
            total_roster_weeks_all += weeks_in_season
            
            if weeks_in_season >= 7:
                valid_seasons.append(int(yr))
                
            starters_in_season = yr_group[~yr_group["slot_position"].isin(bench_slots)]
            total_starter_games += len(starters_in_season)
            total_starter_pts += float(starters_in_season["points"].sum())
        
        if len(valid_seasons) >= 2:
            p_pos = str(roster_entries["position"].iloc[0])
            valid_seasons.sort()
            seasons_str = ", ".join([str(s)[-2:] for s in valid_seasons])
            
            cornerstone_payload.append({
                "owner": owner,
                "manager": owner,
                "player": clean_name,
                "pos": p_pos,
                "starter_games": total_starter_games,
                "games_on_roster": total_roster_weeks_all,
                "starter_pts": round(total_starter_pts, 1),
                "seasons": len(valid_seasons),
                "tenure": len(valid_seasons),
                "years_list": valid_seasons,
                "years_display": seasons_str
            })

# 10. LINEUP EFFICIENCY & OPTIMAL DELTA
efficiency_manager_stats = {}

if not df_players.empty:
    for (yr, wk, t_name, owner), group in df_players.groupby(["year", "week", "team_name", "owner_name"]):
        if owner in [None, "None", "nan", ""]: continue
        
        if owner not in efficiency_manager_stats:
            efficiency_manager_stats[owner] = {
                "games": 0,
                "actual_starter_pts": 0.0,
                "bench_pts": 0.0,
                "optimal_pts": 0.0
            }
            
        efficiency_manager_stats[owner]["games"] += 1
        
        starters = group[~group["slot_position"].isin(bench_slots)]
        bench = group[group["slot_position"].isin(bench_slots)]
        
        act_pts = float(starters["points"].sum())
        b_pts = float(bench["points"].sum())
        
        efficiency_manager_stats[owner]["actual_starter_pts"] += act_pts
        efficiency_manager_stats[owner]["bench_pts"] += b_pts
        
        all_players = group.sort_values(by="points", ascending=False)
        pos_limits = {'QB': 1, 'RB': 2, 'WR': 2, 'TE': 1, 'K': 1, 'D/ST': 1, 'FLEX': 1}
        pos_filled = {'QB': 0, 'RB': 0, 'WR': 0, 'TE': 0, 'K': 0, 'D/ST': 0}
        flex_candidates = []
        opt_total = 0.0
        
        for _, pl in all_players.iterrows():
            pos = str(pl['position'])
            pts = float(pl['points'])
            
            if pos in pos_filled and pos_filled[pos] < pos_limits[pos]:
                pos_filled[pos] += 1
                opt_total += pts
            elif pos in ['RB', 'WR', 'TE']:
                flex_candidates.append(pts)
                
        flex_limit = pos_limits.get('FLEX', 1)
        flex_candidates.sort(reverse=True)
        for f_pts in flex_candidates[:flex_limit]:
            opt_total += f_pts
            
        opt_total = max(opt_total, act_pts)
        efficiency_manager_stats[owner]["optimal_pts"] += opt_total

efficiency_payload = []
for owner, data in efficiency_manager_stats.items():
    games = data["games"]
    if games == 0: continue
    
    act_ppg = data["actual_starter_pts"] / games
    bench_ppg = data["bench_pts"] / games
    opt_ppg = data["optimal_pts"] / games
    eff_pct = (act_ppg / opt_ppg * 100.0) if opt_ppg > 0 else 0.0
    
    efficiency_payload.append({
        "manager": owner,
        "games": games,
        "actual_ppg": round(act_ppg, 2),
        "bench_ppg": round(bench_ppg, 2),
        "optimal_ppg": round(opt_ppg, 2),
        "efficiency_pct": round(eff_pct, 1),
        "ratio": round(data["bench_pts"] / max(data["actual_starter_pts"], 1), 3)
    })

efficiency_payload.sort(key=lambda x: x["efficiency_pct"], reverse=True)


web_payload = {
    "years": [int(y) for y in all_years],
    "manager_profiles": manager_profiles,
    "teams_history": df_teams_hist.to_dict(orient="records"),
    "matchups": df_matchups.to_dict(orient="records"),
    "roster_stats": roster_weekly,
    "weekly_players": weekly_top_players,
    "cornerstone_stats_b": cornerstones,
    "cornerstone_stats": cornerstone_payload,
    "true_keepers": true_keepers,
    "goose_eggs": goose_eggs,
    "player_seasons": player_seasons,
    "streaks_data": streaks_data,
    "season_narratives": season_narratives,
    "brackets_by_season": brackets_by_season,
    "trades_data": trades_data,
    "draft_vault": draft_vault_payload,
    "player_directory": player_directory_list
}

with open("data.json", "w") as f:
    json.dump(web_payload, f, indent=2, cls=NpEncoder)

print(f"Generated data.json successfully with {len(all_years)} active completed seasons, {len(true_keepers)} true keepers, and {len(all_draft_picks_enriched)} draft picks parsed!")