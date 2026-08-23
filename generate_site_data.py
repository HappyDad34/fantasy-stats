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

# Check which tables exist in the database
existing_tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]

df_matchups = pd.read_sql_query("SELECT * FROM matchups", conn) if "matchups" in existing_tables else pd.DataFrame()
df_teams_hist = pd.read_sql_query("SELECT * FROM teams_history", conn) if "teams_history" in existing_tables else pd.DataFrame()
df_players = pd.read_sql_query("SELECT * FROM player_box_scores", conn) if "player_box_scores" in existing_tables else pd.DataFrame()
df_trans = pd.read_sql_query("SELECT * FROM transactions", conn) if "transactions" in existing_tables else pd.DataFrame()
df_draft = pd.read_sql_query("SELECT * FROM draft_picks", conn) if "draft_picks" in existing_tables else pd.DataFrame()

conn.close()

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

# Robust Years Extraction
years_m = [int(y) for y in df_matchups["year"].dropna().unique()] if not df_matchups.empty else []
years_t = [int(y) for y in df_teams_hist["year"].dropna().unique()] if not df_teams_hist.empty else []
years_p = [int(y) for y in df_players["year"].dropna().unique()] if not df_players.empty else []
all_years = sorted(list(set(years_m + years_t + years_p)))
if not all_years:
    all_years = list(range(2017, 2026))

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

# 4. Streaks Data
streaks_data = {}
if not df_matchups.empty:
    df_sorted_match = df_matchups.sort_values(by=['year', 'week']).copy()
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

# 5. Season Narratives
season_narratives = {}
if not df_matchups.empty:
    for yr in all_years:
        yr_matches = df_matchups[df_matchups['year'] == yr]
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

# 6. Playoff Brackets
brackets_by_season = {}
if not df_matchups.empty:
    for yr in all_years:
        playoff_matches = df_matchups[(df_matchups['year'] == yr) & (df_matchups['matchup_type'] == 'PLAYOFF')].sort_values(by='week')
        consol_matches = df_matchups[(df_matchups['year'] == yr) & (df_matchups['matchup_type'] == 'CONSOLATION')].sort_values(by='week')

        def structure_bracket(matches):
            weeks = sorted(matches['week'].unique().tolist())
            rounds = []
            for idx, wk in enumerate(weeks):
                wk_matches = matches[matches['week'] == wk]
                match_list = []
                for _, m in wk_matches.iterrows():
                    match_list.append({
                        'home_owner': m['home_owner'],
                        'home_team': m['home_team_name'],
                        'home_score': float(m['home_score']),
                        'away_owner': m['away_owner'],
                        'away_team': m['away_team_name'],
                        'away_score': float(m['away_score']),
                        'winner_owner': m['winner_owner'],
                        'margin': float(m['margin']),
                        'week': int(m['week']),
                        'year': int(m['year'])
                    })
                
                if len(weeks) == 3:
                    r_name = "Quarterfinals (Rd 1)" if idx == 0 else ("Semifinals (Rd 2)" if idx == 1 else "Championship & Podium (Rd 3)")
                elif len(weeks) == 2:
                    r_name = "Semifinals (Rd 1)" if idx == 0 else "Championship Finals (Rd 2)"
                else:
                    r_name = f"Playoff Round {idx + 1}"

                rounds.append({'round_name': r_name, 'week': int(wk), 'matches': match_list})
            return rounds

        brackets_by_season[int(yr)] = {
            'playoff_rounds': structure_bracket(playoff_matches),
            'consolation_rounds': structure_bracket(consol_matches)
        }

# 7. Trades Data (Accurate Verified Trades from Transactions Table)
trades_data = []
if not df_trans.empty:
    for _, t in df_trans.iterrows():
        yr = int(t['year'])
        wk = int(t['week'])
        p_name = str(t['player_name'])
        to_owner = str(t['to_owner'])
        from_owner = str(t['from_owner'])

        pts_after = 0.0
        starts_after = 0
        pos = "FLEX"

        if not df_players.empty:
            post_trade_entries = df_players[
                (df_players['year'] == yr) &
                (df_players['player_name'] == p_name) &
                (df_players['owner_name'] == to_owner) &
                (df_players['week'] >= wk)
            ]
            if not post_trade_entries.empty:
                pos = str(post_trade_entries['position'].iloc[0])
                starters = post_trade_entries[~post_trade_entries['slot_position'].isin(bench_slots)]
                pts_after = float(starters['points'].sum())
                starts_after = int(len(starters))

        trades_data.append({
            'year': int(yr),
            'week': int(wk),
            'player': p_name,
            'pos': pos,
            'from_owner': from_owner,
            'to_owner': to_owner,
            'pts_produced': round(pts_after, 1),
            'starts': int(starts_after)
        })

    trades_data.sort(key=lambda x: (x['year'], x['week']), reverse=True)

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
    for yr in all_years:
        season_picks = [p for p in all_draft_picks_enriched if p['year'] == yr]
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

web_payload = {
    "years": [int(y) for y in all_years],
    "manager_profiles": manager_profiles,
    "teams_history": df_teams_hist.to_dict(orient="records"),
    "matchups": df_matchups.to_dict(orient="records"),
    "roster_stats": roster_weekly,
    "weekly_players": weekly_top_players,
    "cornerstone_stats": cornerstones,
    "true_keepers": true_keepers,
    "goose_eggs": goose_eggs,
    "player_seasons": player_seasons,
    "streaks_data": streaks_data,
    "season_narratives": season_narratives,
    "brackets_by_season": brackets_by_season,
    "trades_data": trades_data,
    "draft_vault": draft_vault_payload
}

with open("data.json", "w") as f:
    json.dump(web_payload, f, indent=2, cls=NpEncoder)

print(f"Generated data.json successfully with {len(all_years)} active seasons, {len(true_keepers)} true keepers, and {len(all_draft_picks_enriched)} draft picks parsed!")