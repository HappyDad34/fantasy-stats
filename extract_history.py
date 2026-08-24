import os
import sqlite3
import sys
import requests
from espn_api.football import League

# Force UTF-8 encoding for standard output on Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

# Read from Environment variables with local fallbacks
LEAGUE_ID = int(os.getenv("ESPN_LEAGUE_ID", "12345678"))
SWID = os.getenv("ESPN_SWID", "{YOUR-LOCAL-SWID}")
ESPN_S2 = os.getenv("ESPN_S2", "YOUR-LOCAL-ESPN_S2")
YEARS = list(range(2017, 2027))

# Credential guardrail
if LEAGUE_ID == 12345678 or "YOUR-LOCAL-ESPN_S2" in ESPN_S2 or "{YOUR-LOCAL-SWID}" in SWID:
    print("\n[ERROR] ESPN credentials not found in environment variables!")
    print("Please export your credentials before running:")
    print('  export ESPN_LEAGUE_ID="your_id"')
    print('  export ESPN_SWID="{your_swid}"')
    print('  export ESPN_S2="your_s2"\n')
    sys.exit(1)

KNOWN_TEAM_OWNERS = {
    "riddled with anxiety": "Marlene Holm",
    "team dez x": "Desmon Holton",
    "- patriots fan": "Trenton Holm",
    "bandito burrito": "Darin Mikesell",
    "fantasy legend": "David Holm",
    "ocd mama": "Julie Mikesell",
    "arizona big girls": "Ashton Anderson",
    "freight train": "Bryce Mikesell",
    "frost warning": "Jordan Iden",
    "LÃ¸CK DÃ¸WN": "Desmon Holton",
    "lock down": "Desmon Holton",
    "team anderson": "Jeff Anderson",
    "team outlawed": "Michael Searcy",
    "WÄ¯Â§h DÃ¸ctÃ¸r": "Bryce Mikesell",
    "wish doctor": "Bryce Mikesell",
}

# ESPN purges retired players from their active database; this maps their IDs back to their names
KNOWN_PLAYERS = {
    11289: "Jordy Nelson",
    10447: "Drew Brees",
    11237: "Matt Forte",
    2580: "Tom Brady",
    11270: "Jamaal Charles",
    11288: "DeSean Jackson",
    8439: "Aaron Rodgers",
    5536: "Antonio Brown",
    13994: "Julio Jones",
    16732: "Kelvin Benjamin",
    10452: "Marshawn Lynch",
    15795: "Le'Veon Bell",
    13982: "DeMarco Murray",
    13981: "A.J. Green",
    14001: "Randall Cobb",
    11283: "LeSean McCoy",
    4870808: "Jeremiyah Love",
    4723086: "Colston Loveland",
    4685512: "Jadarian Price",
    4685278: "Luther Burden III",
    4871023: "Carnell Tate",
    4870795: "Makai Lemon",
    4710714: "De'Zhaun Stribling",
    4870653: "KC Concepcion",
    4242512: "Malik Willis",
    4574716: "Harrison Mevis",
    4870847: "Ja'Kobi Lane",
    4832800: "Denzel Boston"
}

MANUAL_OVERRIDES = {}

STANDINGS_OVERRIDES = {
    (2017, "Desmon Holton"): 1,
    (2017, "Darin Mikesell"): 2,
    (2017, "David Holm"): 3,
    (2018, "Marlene Holm"): 1,
    (2018, "Trenton Holm"): 2,
    (2018, "Darin Mikesell"): 3,
    (2019, "Marlene Holm"): 1,
    (2019, "Jordan Iden"): 2,
    (2019, "Julie Mikesell"): 3,
}

POS_MAP = {1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST'}
SLOT_MAP = {0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'D/ST', 17: 'K', 20: 'BE', 21: 'IR', 23: 'FLEX'}

conn = sqlite3.connect("league_history.db")
cursor = conn.cursor()

cursor.execute('DROP TABLE IF EXISTS teams_history')
cursor.execute('DROP TABLE IF EXISTS matchups')
cursor.execute('DROP TABLE IF EXISTS player_box_scores')
cursor.execute('DROP TABLE IF EXISTS transactions')
cursor.execute('DROP TABLE IF EXISTS draft_picks')

cursor.execute('''
CREATE TABLE teams_history (
    year INTEGER,
    team_id INTEGER,
    team_name TEXT,
    owner_id TEXT,
    owner_name TEXT,
    final_standing INTEGER,
    PRIMARY KEY (year, team_id)
)
''')

cursor.execute('''
CREATE TABLE matchups (
    year INTEGER,
    week INTEGER,
    matchup_type TEXT,
    home_team_id INTEGER,
    home_team_name TEXT,
    home_owner TEXT,
    home_score REAL,
    away_team_id INTEGER,
    away_team_name TEXT,
    away_owner TEXT,
    away_score REAL,
    winner_team_id INTEGER,
    winner_team_name TEXT,
    winner_owner TEXT,
    margin REAL
)
''')

cursor.execute('''
CREATE TABLE player_box_scores (
    year INTEGER,
    week INTEGER,
    team_name TEXT,
    owner_name TEXT,
    player_name TEXT,
    player_id INTEGER,
    position TEXT,
    slot_position TEXT,
    points REAL,
    projected_points REAL
)
''')

cursor.execute('''
CREATE TABLE transactions (
    year INTEGER,
    week INTEGER,
    trans_type TEXT,
    player_name TEXT,
    player_id INTEGER,
    from_owner TEXT,
    to_owner TEXT
)
''')

cursor.execute('''
CREATE TABLE draft_picks (
    year INTEGER,
    round_num INTEGER,
    round_pick INTEGER,
    overall_pick INTEGER,
    team_id INTEGER,
    team_name TEXT,
    owner_name TEXT,
    player_name TEXT,
    player_id INTEGER,
    bid_amount INTEGER,
    keeper INTEGER
)
''')

global_member_map = {}
global_player_map = {}

print("Harvesting league member directory across seasons...")
for yr in reversed(YEARS):
    try:
        lg = League(league_id=LEAGUE_ID, year=yr, espn_s2=ESPN_S2, swid=SWID)
        if hasattr(lg, 'members') and lg.members:
            for m in lg.members:
                if isinstance(m, dict):
                    m_id = str(m.get('id', '')).strip('{}').upper()
                    first = str(m.get('firstName', '')).strip()
                    last = str(m.get('lastName', '')).strip()
                    full = f"{first} {last}".strip() or str(m.get('displayName', '')).strip()
                else:
                    m_id = str(getattr(m, 'id', '')).strip('{}').upper()
                    first = str(getattr(m, 'first_name', '')).strip()
                    last = str(getattr(m, 'last_name', '')).strip()
                    full = f"{first} {last}".strip() or str(getattr(m, 'display_name', '')).strip()

                if m_id and full and m_id not in global_member_map:
                    global_member_map[m_id] = full
    except Exception:
        continue


def extract_owners_list(raw_owners, team_name, year, team_id, local_member_map=None):
    if (year, team_id) in MANUAL_OVERRIDES:
        return [MANUAL_OVERRIDES[(year, team_id)]]

    combined_map = {**global_member_map, **(local_member_map or {})}
    resolved_names = []

    if raw_owners:
        for o in raw_owners:
            if isinstance(o, dict):
                first = str(o.get('firstName', '')).strip()
                last = str(o.get('lastName', '')).strip()
                name = f"{first} {last}".strip() or str(o.get('displayName', '')).strip()
                if name:
                    resolved_names.append(name)
                    continue

                o_id = str(o.get('id', '')).strip('{}').upper()
                if o_id in combined_map:
                    resolved_names.append(combined_map[o_id])
                    continue
            else:
                o_id = str(o).strip('{}').upper()
                if o_id in combined_map:
                    resolved_names.append(combined_map[o_id])
                    continue

    if resolved_names:
        return resolved_names

    clean_team = str(team_name).strip().lower()
    for k, v in KNOWN_TEAM_OWNERS.items():
        if k.strip().lower() == clean_team or k.strip() == str(team_name).strip():
            return [v]

    return [str(team_name).strip()]


def extract_full_season(year):
    cookies = {"espn_s2": ESPN_S2, "SWID": SWID}
    headers = {"Accept": "application/json"}

    # Step A: Fetch League Structure, Teams, Members & Draft Detail
    if year < 2019:
        url_base = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/{LEAGUE_ID}"
        params_overview = {
            "seasonId": year,
            "view": ["mTeam", "mMatchup", "mSettings", "mTransactions2", "mDraftDetail", "kona_player_info"]
        }
    else:
        url_base = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{LEAGUE_ID}"
        params_overview = {
            "view": ["mTeam", "mMatchup", "mSettings", "mTransactions2", "mDraftDetail", "kona_player_info"]
        }

    res = requests.get(url_base, params=params_overview, cookies=cookies, headers=headers)
    if res.status_code != 200:
        return False

    raw_json = res.json()
    season_data = next((s for s in raw_json if s.get('seasonId') == year), raw_json[0]) if isinstance(raw_json, list) else raw_json

    local_player_map = {}
    for p in season_data.get('players', []):
        p_obj = p.get('player', p)
        p_id = p_obj.get('id')
        p_name = p_obj.get('fullName')
        pos = POS_MAP.get(p_obj.get('defaultPositionId'), 'FLEX')
        if p_id and p_name:
            local_player_map[p_id] = (p_name, pos)
            global_player_map[p_id] = (p_name, pos)

    local_member_map = {}
    for m in season_data.get('members', []):
        m_id = str(m.get('id', '')).strip('{}').upper()
        name = f"{m.get('firstName', '')} {m.get('lastName', '')}".strip() or m.get('displayName', '')
        if m_id and name:
            local_member_map[m_id] = name

    team_raw_owners = {}
    team_lookup = {}
    for t in season_data.get('teams', []):
        t_id = t['id']
        t_name = t.get('name') or f"{t.get('location', '')} {t.get('nickname', '')}".strip() or f"Team {t_id}"
        owners = t.get('owners', [t.get('primaryOwner', '')])
        team_raw_owners[t_id] = (t_name, owners, extract_owners_list(owners, t_name, year, t_id, local_member_map))

    claimed_solo = {owners[0] for t_id, (name, raw_o, owners) in team_raw_owners.items() if len(owners) == 1}

    for t in season_data.get('teams', []):
        t_id = t['id']
        t_name, owners, resolved_owners = team_raw_owners[t_id]

        if (year, t_id) in MANUAL_OVERRIDES:
            final_owner = MANUAL_OVERRIDES[(year, t_id)]
        elif len(resolved_owners) == 1:
            final_owner = resolved_owners[0]
        else:
            unique_co = [o for o in resolved_owners if o not in claimed_solo]
            final_owner = unique_co[0] if unique_co else resolved_owners[0]

        final_rank = t.get('rankCalculatedFinal') or t.get('playoffSeed') or 0
        for (ov_yr, ov_key), ov_rank in STANDINGS_OVERRIDES.items():
            if ov_yr == year:
                if (isinstance(ov_key, int) and ov_key == t_id) or (isinstance(ov_key, str) and ov_key.strip().lower() == final_owner.strip().lower()):
                    final_rank = ov_rank
                    break

        team_lookup[t_id] = (t_name, final_owner)
        cursor.execute('INSERT OR REPLACE INTO teams_history VALUES (?, ?, ?, ?, ?, ?)',
                       (year, t_id, t_name, str(owners), final_owner, int(final_rank)))

    # Matchups Schedule
    schedule = season_data.get('schedule', [])
    max_week = 1
    for match in schedule:
        week = match.get('matchupPeriodId', 1)
        if week > max_week:
            max_week = week
        home, away = match.get('home'), match.get('away')
        if not home or not away:
            continue

        h_id, a_id = home.get('teamId'), away.get('teamId')
        h_name, h_owner = team_lookup.get(h_id, (f"Team {h_id}", f"Owner {h_id}"))
        a_name, a_owner = team_lookup.get(a_id, (f"Team {a_id}", f"Owner {a_id}"))

        h_score = float(home.get('totalPoints', 0.0))
        a_score = float(away.get('totalPoints', 0.0))
        margin = round(abs(h_score - a_score), 2)

        if h_score > a_score:
            w_id, w_name, w_owner = h_id, h_name, h_owner
        elif a_score > h_score:
            w_id, w_name, w_owner = a_id, a_name, a_owner
        else:
            w_id, w_name, w_owner = 0, "TIE", "TIE"

        raw_tier = str(match.get('playoffTierType', '')).upper().strip()
        if 'WINNERS_BRACKET' in raw_tier:
            m_type = "PLAYOFF"
        elif any(k in raw_tier for k in ['LOSER', 'CONSOLATION', 'LADDER', 'TOILET']):
            m_type = "CONSOLATION"
        elif match.get('playoffTierType'):
            m_type = "PLAYOFF"
        else:
            m_type = "REGULAR"

        cursor.execute('INSERT INTO matchups VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                       (year, week, m_type, h_id, h_name, h_owner, h_score,
                        a_id, a_name, a_owner, a_score, w_id, w_name, w_owner, margin))

    # Draft Detail
    draft_picks = season_data.get('draftDetail', {}).get('picks', [])
    for pick in draft_picks:
        r_num = pick.get('roundId', 1)
        r_pick = pick.get('roundPickNumber', 1)
        overall = pick.get('overallPickNumber', 1)
        t_id = pick.get('teamId', 0)
        bid = pick.get('bidAmount', 0)
        p_id = pick.get('playerId', 0)
        is_keeper = 1 if pick.get('keeper') is True or pick.get('reservedForKeeper') is True else 0

        p_info = local_player_map.get(p_id) or global_player_map.get(p_id)
        if p_info:
            p_name = p_info[0]
        elif p_id in KNOWN_PLAYERS:
            p_name = KNOWN_PLAYERS[p_id]
        else:
            p_name = pick.get('playerPoolEntry', {}).get('player', {}).get('fullName') or f"Player {p_id}"

        t_name, o_name = team_lookup.get(t_id, (f"Team {t_id}", f"Owner {t_id}"))

        cursor.execute('INSERT INTO draft_picks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                       (year, r_num, r_pick, overall, t_id, t_name, o_name, p_name, p_id, bid, is_keeper))

    # Verified Trades Extraction
    for trans in season_data.get('transactions', []):
        if trans.get('type') in ['TRADE_ACCEPT', 'TRADE']:
            week = trans.get('scoringPeriodId', 1)
            for item in trans.get('items', []):
                from_id = item.get('fromTeamId')
                to_id = item.get('toTeamId')
                p_id = item.get('playerId')
                
                if not from_id or not to_id or not p_id or item.get('type') == 'LINEUP':
                    continue
                    
                p_info = local_player_map.get(p_id) or global_player_map.get(p_id)
                if p_info:
                    p_name = p_info[0]
                elif p_id in KNOWN_PLAYERS:
                    p_name = KNOWN_PLAYERS[p_id]
                else:
                    p_name = f"Player {p_id}"
                    
                _, from_owner = team_lookup.get(from_id, (f"Team {from_id}", f"Owner {from_id}"))
                _, to_owner = team_lookup.get(to_id, (f"Team {to_id}", f"Owner {to_id}"))
                
                cursor.execute('INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?)',
                               (year, week, 'TRADE_ACCEPT', p_name, p_id, from_owner, to_owner))

    # Step B: Loop through EVERY WEEK (1 to max_week) to extract complete player box scores
    print(f"   --> Harvesting weekly box scores for weeks 1 to {max_week}...")
    for wk in range(1, max_week + 1):
        if year < 2019:
            params_wk = {
                "seasonId": year,
                "scoringPeriodId": wk,
                "view": ["mBoxscore", "mMatchupScore", "mRoster"]
            }
        else:
            params_wk = {
                "scoringPeriodId": wk,
                "view": ["mBoxscore", "mMatchupScore", "mRoster"]
            }

        res_wk = requests.get(url_base, params=params_wk, cookies=cookies, headers=headers)
        if res_wk.status_code != 200:
            continue

        wk_json = res_wk.json()
        wk_data = next((s for s in wk_json if s.get('seasonId') == year), wk_json[0]) if isinstance(wk_json, list) else wk_json

        for match in wk_data.get('schedule', []):
            if match.get('matchupPeriodId') != wk:
                continue
            home, away = match.get('home'), match.get('away')
            if not home or not away:
                continue

            h_id, a_id = home.get('teamId'), away.get('teamId')
            h_name, h_owner = team_lookup.get(h_id, (f"Team {h_id}", f"Owner {h_id}"))
            a_name, a_owner = team_lookup.get(a_id, (f"Team {a_id}", f"Owner {a_id}"))
            h_score = float(home.get('totalPoints', 0.0))
            a_score = float(away.get('totalPoints', 0.0))

            if h_score > 0 or a_score > 0:
                for side, t_name, t_owner in [(home, h_name, h_owner), (away, a_name, a_owner)]:
                    r_data = side.get('rosterForCurrentScoringPeriod') or side.get('rosterForMatchupPeriod') or {}
                    for entry in r_data.get('entries', []):
                        p_pool = entry.get('playerPoolEntry', {})
                        p = p_pool.get('player', {})
                        p_id = p.get('id', entry.get('playerId', 0))

                        if p.get('fullName'):
                            p_name = p.get('fullName')
                        elif p_id in KNOWN_PLAYERS:
                            p_name = KNOWN_PLAYERS[p_id]
                        else:
                            p_name = local_player_map.get(p_id, ("Unknown Player", "FLEX"))[0]

                        pos = POS_MAP.get(p.get('defaultPositionId'), 'FLEX')
                        slot = SLOT_MAP.get(entry.get('lineupSlotId'), 'BE')

                        raw_pts = p_pool.get('appliedStatTotal', entry.get('appliedStatTotal', 0.0))
                        pts = float(raw_pts if raw_pts is not None else 0.0)

                        if p_id and p_name != 'Unknown Player':
                            local_player_map[p_id] = (p_name, pos)
                            global_player_map[p_id] = (p_name, pos)

                        cursor.execute('INSERT INTO player_box_scores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                       (year, wk, t_name, t_owner, p_name, p_id, pos, slot, pts, 0.0))

    return True


# --- MAIN INGESTION LOOP ---
for year in YEARS:
    print(f"--> Extracting season {year}...")
    try:
        if extract_full_season(year):
            print(f"   [OK] Season {year} extracted successfully")
    except Exception as e:
        print(f"   [!] Error on {year}: {e}")
    conn.commit()

conn.close()
print("\nExtraction complete! All database tables updated.")