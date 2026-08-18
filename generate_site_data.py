import sqlite3
import json
import pandas as pd

conn = sqlite3.connect("league_history.db")
df_matchups = pd.read_sql_query("SELECT * FROM matchups", conn)
df_teams_hist = pd.read_sql_query("SELECT * FROM teams_history", conn)

try:
    df_players = pd.read_sql_query("SELECT * FROM player_box_scores", conn)
except Exception:
    df_players = pd.DataFrame()

try:
    df_transactions = pd.read_sql_query("SELECT * FROM transactions", conn)
except Exception:
    df_transactions = pd.DataFrame()

conn.close()

# 1. Standardize Matchup Types
def normalize_matchup_type(val):
    v = str(val).upper().strip()
    if v in ['REGULAR', 'REG', 'NONE', '', 'NAN']:
        return 'REGULAR'
    if 'LOSER' in v or 'CONSOLATION' in v or 'LADDER' in v or 'TOILET' in v:
        return 'CONSOLATION'
    if 'WINNER' in v or 'PLAYOFF' in v or 'CHAMPIONSHIP' in v:
        return 'PLAYOFF'
    return 'REGULAR'

df_matchups['matchup_type'] = df_matchups['matchup_type'].apply(normalize_matchup_type)

matchup_type_map = {}
for _, row in df_matchups.iterrows():
    matchup_type_map[(int(row['year']), int(row['week']), row['home_owner'])] = row['matchup_type']
    matchup_type_map[(int(row['year']), int(row['week']), row['away_owner'])] = row['matchup_type']

all_years = sorted(list(set(df_matchups["year"].unique().tolist() + df_teams_hist["year"].unique().tolist())))

# 2. Group by human Owner Name
manager_profiles = {}
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
        "years_active": years_active,
        "all_aliases": aliases_with_years
    }

# 3. Weekly Roster Stats, Lineups, Cornerstones & Player Seasons
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

        m_type = matchup_type_map.get((int(year), int(week), owner), 'REGULAR')

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
        m_type = matchup_type_map.get((int(g['year']), int(g['week']), g['owner_name']), 'REGULAR')
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
            is_starter = p['slot_position'] not in bench_slots
            player_list.append({
                "name": p['player_name'],
                "pos": p['position'],
                "points": round(float(p['points']), 2),
                "owner": p['owner_name'],
                "slot": p['slot_position'],
                "is_starter": bool(is_starter)
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
                is_starter = p['slot_position'] not in bench_slots
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
            "seasons": len(years),
            "years_list": years,
            "years_display": ", ".join([f"'{str(y)[-2:]}" for y in years]),
            "starter_games": starter_games,
            "total_games": total_games,
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
                "starts": starter_games,
                "ppg": round(starter_pts / starter_games, 1) if starter_games > 0 else 0.0
            })

# 4. Calculate Streaks
df_sorted_match = df_matchups.sort_values(by=['year', 'week']).copy()
streaks_data = {}

for manager in manager_profiles.keys():
    mgr_matches = df_sorted_match[(df_sorted_match['home_owner'] == manager) | (df_sorted_match['away_owner'] == manager)]
    results = []
    for _, row in mgr_matches.iterrows():
        won = row['winner_owner'] == manager
        tied = row['winner_owner'] in ['TIE', '0']
        score = row['home_score'] if row['home_owner'] == manager else row['away_score']
        opp_score = row['away_score'] if row['home_owner'] == manager else row['home_score']
        opp = row['away_owner'] if row['home_owner'] == manager else row['home_owner']

        outcome = 'T' if tied else ('W' if won else 'L')
        results.append({
            'year': int(row['year']),
            'week': int(row['week']),
            'type': row['matchup_type'],
            'outcome': outcome,
            'score': score,
            'opp_score': opp_score,
            'opp': opp,
            'margin': row['margin']
        })

    max_w, cur_w, max_l, cur_l = 0, 0, 0, 0
    for r in results:
        if r['outcome'] == 'W':
            cur_w += 1
            cur_l = 0
            if cur_w > max_w: max_w = cur_w
        elif r['outcome'] == 'L':
            cur_l += 1
            cur_w = 0
            if cur_l > max_l: max_l = cur_l
        else:
            cur_w, cur_l = 0, 0

    active_type = results[-1]['outcome'] if results else 'N/A'
    active_count = 0
    if results:
        for r in reversed(results):
            if r['outcome'] == active_type: active_count += 1
            else: break

    last_5 = [r['outcome'] for r in results[-5:]] if len(results) >= 5 else [r['outcome'] for r in results]

    streaks_data[manager] = {
        'manager': manager,
        'longest_win_streak': max_w,
        'longest_loss_streak': max_l,
        'active_type': active_type,
        'active_count': active_count,
        'last_5': last_5,
        'total_games': len(results)
    }

# 5. Calculate Season Narratives
season_narratives = {}
for yr in all_years:
    yr_matches = df_matchups[df_matchups['year'] == yr]
    yr_reg = yr_matches[yr_matches['matchup_type'] == 'REGULAR']
    if yr_reg.empty: continue

    season_stats = {}
    for _, row in yr_reg.iterrows():
        h, a = row['home_owner'], row['away_owner']
        for o, s, opp_s in [(h, row['home_score'], row['away_score']), (a, row['away_score'], row['home_score'])]:
            if o not in season_stats:
                season_stats[o] = {'owner': o, 'wins': 0, 'losses': 0, 'pf': 0.0, 'pa': 0.0, 'games': 0, 'exp_wins': 0, 'close_wins': 0, 'close_losses': 0}
            season_stats[o]['games'] += 1
            season_stats[o]['pf'] += s
            season_stats[o]['pa'] += opp_s
            if s > opp_s:
                season_stats[o]['wins'] += 1
                if abs(s - opp_s) < 5.0: season_stats[o]['close_wins'] += 1
            elif s < opp_s:
                season_stats[o]['losses'] += 1
                if abs(s - opp_s) < 5.0: season_stats[o]['close_losses'] += 1

    for wk, wk_group in yr_reg.groupby('week'):
        scores = []
        for _, r in wk_group.iterrows():
            scores.append((r['home_owner'], r['home_score']))
            scores.append((r['away_owner'], r['away_score']))
        for i in range(len(scores)):
            for j in range(len(scores)):
                if i != j and scores[i][0] in season_stats:
                    if scores[i][1] > scores[j][1]:
                        season_stats[scores[i][0]]['exp_wins'] += 1 / (len(scores) - 1)

    stat_list = list(season_stats.values())
    if not stat_list: continue

    stat_list.sort(key=lambda x: (x['wins'] - x['exp_wins']), reverse=True)
    overachiever = stat_list[0]
    underachiever = stat_list[-1]
    juggernaut = sorted(stat_list, key=lambda x: x['pf'], reverse=True)[0]
    iron_curtain = sorted(stat_list, key=lambda x: x['pa'])[0]
    cardiac = sorted(stat_list, key=lambda x: x['close_wins'], reverse=True)[0]
    heartbreak = sorted(stat_list, key=lambda x: x['close_losses'], reverse=True)[0]

    season_narratives[yr] = {
        'overachiever': { 'owner': overachiever['owner'], 'wins': overachiever['wins'], 'exp_wins': round(overachiever['exp_wins'], 1), 'diff': round(overachiever['wins'] - overachiever['exp_wins'], 1) },
        'underachiever': { 'owner': underachiever['owner'], 'wins': underachiever['wins'], 'exp_wins': round(underachiever['exp_wins'], 1), 'diff': round(underachiever['wins'] - underachiever['exp_wins'], 1) },
        'juggernaut': { 'owner': juggernaut['owner'], 'pf': round(juggernaut['pf'], 1), 'ppg': round(juggernaut['pf'] / juggernaut['games'], 1) },
        'iron_curtain': { 'owner': iron_curtain['owner'], 'pa': round(iron_curtain['pa'], 1), 'ppg': round(iron_curtain['pa'] / iron_curtain['games'], 1) },
        'cardiac': { 'owner': cardiac['owner'], 'close_wins': cardiac['close_wins'] },
        'heartbreak': { 'owner': heartbreak['owner'], 'close_losses': heartbreak['close_losses'] },
        'regular_standings': sorted(stat_list, key=lambda x: (x['wins'], x['pf']), reverse=True)
    }

# 6. Build Interactive Playoff & Consolation Bracket Trees
brackets_by_season = {}
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
                    'home_score': m['home_score'],
                    'away_owner': m['away_owner'],
                    'away_team': m['away_team_name'],
                    'away_score': m['away_score'],
                    'winner_owner': m['winner_owner'],
                    'margin': m['margin'],
                    'week': int(m['week']),
                    'year': int(m['year'])
                })
            
            # Label round names
            if len(weeks) == 3:
                r_name = "Quarterfinals (Rd 1)" if idx == 0 else ("Semifinals (Rd 2)" if idx == 1 else "Championship & Podium (Rd 3)")
            elif len(weeks) == 2:
                r_name = "Semifinals (Rd 1)" if idx == 0 else "Championship Finals (Rd 2)"
            else:
                r_name = f"Playoff Round {idx + 1}"

            rounds.append({'round_name': r_name, 'week': int(wk), 'matches': match_list})
        return rounds

    brackets_by_season[yr] = {
        'playoff_rounds': structure_bracket(playoff_matches),
        'consolation_rounds': structure_bracket(consol_matches)
    }

# 7. Harvest Trades & Calculate Post-Trade Point Output
trades_data = []
if not df_players.empty:
    # Detect intra-season player team transitions
    for (year, player_name), p_group in df_players.groupby(['year', 'player_name']):
        owners_in_order = []
        for _, r in p_group.sort_values(by='week').iterrows():
            if not owners_in_order or owners_in_order[-1]['owner'] != r['owner_name']:
                owners_in_order.append({'owner': r['owner_name'], 'team': r['team_name'], 'week': int(r['week'])})
        
        if len(owners_in_order) >= 2:
            prev = owners_in_order[0]
            new = owners_in_order[1]
            trade_week = new['week']

            pts_before = p_group[(p_group['owner_name'] == prev['owner']) & (p_group['week'] < trade_week)]['points'].sum()
            pts_after = p_group[(p_group['owner_name'] == new['owner']) & (p_group['week'] >= trade_week)]['points'].sum()
            starts_after = len(p_group[(p_group['owner_name'] == new['owner']) & (p_group['week'] >= trade_week) & (~p_group['slot_position'].isin(bench_slots))])

            trades_data.append({
                'year': int(year),
                'week': int(trade_week),
                'player': player_name,
                'pos': p_group['position'].iloc[0],
                'from_owner': prev['owner'],
                'to_owner': new['owner'],
                'pts_produced': round(float(pts_after), 1),
                'starts': starts_after,
                'pts_before': round(float(pts_before), 1)
            })

trades_data.sort(key=lambda x: (x['year'], x['week']), reverse=True)

web_payload = {
    "years": all_years,
    "manager_profiles": manager_profiles,
    "teams_history": df_teams_hist.to_dict(orient="records"),
    "matchups": df_matchups.to_dict(orient="records"),
    "roster_stats": roster_weekly,
    "weekly_players": weekly_top_players,
    "cornerstone_stats": cornerstones,
    "goose_eggs": goose_eggs,
    "player_seasons": player_seasons,
    "streaks_data": streaks_data,
    "season_narratives": season_narratives,
    "brackets_by_season": brackets_by_season,
    "trades_data": trades_data
}

with open("data.json", "w") as f:
    json.dump(web_payload, f, indent=2)

print(f"Generated data.json successfully with Playoff Bracket trees and {len(trades_data)} player trades tracked!")