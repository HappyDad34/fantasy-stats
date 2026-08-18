import sqlite3
import requests
from espn_api.football import League

# Read from GitHub Secrets / Environment variables, with local fallbacks
LEAGUE_ID = int(os.getenv("ESPN_LEAGUE_ID", "12345678"))  # Replace default with your League ID
SWID = os.getenv("ESPN_SWID", "{YOUR-LOCAL-SWID}")        # Replace default for local runs
ESPN_S2 = os.getenv("ESPN_S2", "YOUR-LOCAL-ESPN_S2")      # Replace default for local runs
YEARS = list(range(2017, 2026))  # 9+ years of data

# 1. MAP TEAM NAMES DIRECTLY TO MANAGERS (Case-Insensitive Fallback for 2017-2018)
# Add any other 2017/2018 team names here if needed:
KNOWN_TEAM_OWNERS = {
    "riddled with anxiety": "Marlene Holm",
    "team dez x": "Desmon Holton",
    "- patriots fan": "Trenton Holm",
    "bandito burrito": "Darin Mikesell",
    "fantasy legend": "David Holm",
    "ocd mama": "Julie Mikesell",
    "arizona big girls": "Ashton Anderson",
    "freight train": "bryce mikesell",
    "frost warning": "Jordan Iden",
    "LÃ¸CK DÃ¸WN": "Desmon Holton",
    "team anderson": "Jeff Anderson",
    "team outlawed": "Michael Searcy",
    "WÄ¯Â§h DÃ¸ctÃ¸r": "bryce mikesell",
    # "another old team name": "Manager Name",
}

# OPTIONAL MANUAL OVERRIDES FOR CO-MANAGERS: (year, team_id) -> "Manager Name"
MANUAL_OVERRIDES = {
    # (2021, 4): "Cody",
}

# MANUAL OVERRIDES FOR HISTORICAL PODIUM/FINISHES:
# Format: (year, "Owner Name") -> final_rank  OR  (year, team_id) -> final_rank
STANDINGS_OVERRIDES = {
    (2017, "Desmon Holton"): 1,
    (2017, "Darin Mikesell"): 2,
    (2017, "Dave Holm"): 3,
    (2018, "Marlene Holm"): 1,
    (2018, "Trenton Holm"): 2,
    (2018, "Darin Mikesell"): 3,
    (2019, "Marlene Holm"): 1,
    (2019, "Jordan Iden"): 2,
    (2019, "Julie Mikesell"): 3,
    # Add any other known 2nd/3rd place finishes if ESPN lost them:
    # (2017, "Runner Up Name"): 2,
}

POS_MAP = {1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'D/ST'}
SLOT_MAP = {0: 'QB', 2: 'RB', 4: 'WR', 6: 'TE', 16: 'D/ST', 17: 'K', 20: 'BE', 21: 'IR', 23: 'FLEX'}

conn = sqlite3.connect("league_history.db")
cursor = conn.cursor()

cursor.execute('DROP TABLE IF EXISTS teams_history')
cursor.execute('DROP TABLE IF EXISTS matchups')
cursor.execute('DROP TABLE IF EXISTS player_box_scores')
cursor.execute('DROP TABLE IF EXISTS transactions')

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
    position TEXT,
    slot_position TEXT,
    points REAL,
    projected_points REAL
)
''')

cursor.execute('''
CREATE TABLE transactions (
    year INTEGER,
    period_id INTEGER,
    trans_type TEXT,
    team_id INTEGER,
    team_name TEXT,
    owner_name TEXT,
    player_name TEXT,
    bid_amount INTEGER
)
''')

global_member_map = {}
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


def extract_pre2019_direct(year):
    url = f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/leagueHistory/{LEAGUE_ID}"
    params = {
        "seasonId": year,
        "view": ["mTeam", "mMatchup", "mRoster", "mSettings", "mBoxscore", "mMatchupScore", "mTransactions2"]
    }
    cookies = {"espn_s2": ESPN_S2, "SWID": SWID}
    headers = {"Accept": "application/json"}

    res = requests.get(url, params=params, cookies=cookies, headers=headers)
    if res.status_code != 200:
        return False

    data_list = res.json()
    if not data_list or not isinstance(data_list, list):
        return False

    season_data = next((s for s in data_list if s.get('seasonId') == year), data_list[0])

    local_member_map = {}
    for m in season_data.get('members', []):
        m_id = str(m.get('id', '')).strip('{}').upper()
        name = f"{m.get('firstName', '')} {m.get('lastName', '')}".strip() or m.get('displayName', '')
        if m_id and name:
            local_member_map[m_id] = name

    team_raw_owners = {}
    for t in season_data.get('teams', []):
        t_id = t['id']
        t_name = t.get('name') or f"{t.get('location', '')} {t.get('nickname', '')}".strip() or f"Team {t_id}"
        owners = t.get('owners', [t.get('primaryOwner', '')])
        team_raw_owners[t_id] = (t_name, owners, extract_owners_list(owners, t_name, year, t_id, local_member_map))

    claimed_solo = {owners[0] for t_id, (name, raw_o, owners) in team_raw_owners.items() if len(owners) == 1}

    team_lookup = {}
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

    matchup_count = 0
    for match in season_data.get('schedule', []):
        week = match.get('matchupPeriodId', 1)
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
        matchup_count += 1

        for side, t_name, t_owner in [(home, h_name, h_owner), (away, a_name, a_owner)]:
            r_data = side.get('rosterForCurrentScoringPeriod') or side.get('rosterForMatchupPeriod') or {}
            for entry in r_data.get('entries', []):
                p = entry.get('playerPoolEntry', {}).get('player', {})
                p_name = p.get('fullName', 'Unknown Player')
                pos = POS_MAP.get(p.get('defaultPositionId'), 'FLEX')
                slot = SLOT_MAP.get(entry.get('lineupSlotId'), 'BE')
                pts = float(entry.get('appliedStatTotal', 0.0))
                cursor.execute('INSERT INTO player_box_scores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                               (year, week, t_name, t_owner, p_name, pos, slot, pts, 0.0))

    # Transactions extraction (Trades & Drops/Adds)
    for trans in season_data.get('transactions', []):
        t_type = trans.get('type', 'WAIVER')
        period = trans.get('scoringPeriodId', 1)
        bid = trans.get('bidAmount', 0)
        for item in trans.get('items', []):
            t_id = item.get('toTeamId') or item.get('fromTeamId')
            t_name, o_name = team_lookup.get(t_id, (f"Team {t_id}", f"Owner {t_id}"))
            p_id = item.get('playerPoolEntry', {}).get('player', {}).get('fullName', f"Player {item.get('playerId', '')}")
            cursor.execute('INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                           (year, period, t_type, t_id, t_name, o_name, p_id, bid))

    return matchup_count > 0


# --- STEP 2: MAIN INGESTION LOOP ---
for year in YEARS:
    print(f"--> Extracting season {year}...")
    success = False

    if year < 2019:
        try:
            if extract_pre2019_direct(year):
                success = True
                print(f"   [✓] Season {year} extracted via direct leagueHistory API")
        except Exception as e:
            print(f"   [!] Direct fallback error on {year}: {e}")

    if not success:
        try:
            league = League(league_id=LEAGUE_ID, year=year, espn_s2=ESPN_S2, swid=SWID)

            local_member_map = {}
            if hasattr(league, 'members') and league.members:
                for m in league.members:
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
                    if m_id and full:
                        local_member_map[m_id] = full

            team_raw_owners = {}
            for team in league.teams:
                raw_owners = getattr(team, 'owners', [])
                team_raw_owners[team.team_id] = extract_owners_list(raw_owners, team.team_name, year, team.team_id, local_member_map)

            claimed_solo = set()
            for t_id, owners in team_raw_owners.items():
                if (year, t_id) in MANUAL_OVERRIDES:
                    claimed_solo.add(MANUAL_OVERRIDES[(year, t_id)])
                elif len(owners) == 1:
                    claimed_solo.add(owners[0])

            team_owner_lookup = {}
            for team in league.teams:
                t_id = team.team_id
                resolved_owners = team_raw_owners[t_id]

                if (year, t_id) in MANUAL_OVERRIDES:
                    final_owner = MANUAL_OVERRIDES[(year, t_id)]
                elif len(resolved_owners) == 1:
                    final_owner = resolved_owners[0]
                else:
                    unique_co = [o for o in resolved_owners if o not in claimed_solo]
                    final_owner = unique_co[0] if unique_co else resolved_owners[0]

                final_rank = getattr(team, 'final_standing', getattr(team, 'standing', 0))
                for (ov_yr, ov_key), ov_rank in STANDINGS_OVERRIDES.items():
                    if ov_yr == year:
                        if (isinstance(ov_key, int) and ov_key == t_id) or (isinstance(ov_key, str) and ov_key.strip().lower() == final_owner.strip().lower()):
                            final_rank = ov_rank
                            break

                team_owner_lookup[t_id] = final_owner
                cursor.execute('INSERT OR REPLACE INTO teams_history VALUES (?, ?, ?, ?, ?, ?)',
                               (year, t_id, team.team_name, str(getattr(team, 'owners', '')), final_owner, int(final_rank)))

            max_weeks = getattr(league.settings, 'matchup_period_count', 17)
            matchup_count = 0
            for week in range(1, max_weeks + 1):
                try:
                    box_scores = league.box_scores(week=week)
                except Exception:
                    continue

                for match in box_scores:
                    if not match.away_team:
                        continue

                    h_id, h_name = match.home_team.team_id, match.home_team.team_name
                    a_id, a_name = match.away_team.team_id, match.away_team.team_name
                    h_owner = team_owner_lookup.get(h_id, h_name)
                    a_owner = team_owner_lookup.get(a_id, a_name)
                    h_score, a_score = match.home_score, match.away_score
                    margin = round(abs(h_score - a_score), 2)

                    if h_score > a_score:
                        w_id, w_name, w_owner = h_id, h_name, h_owner
                    elif a_score > h_score:
                        w_id, w_name, w_owner = a_id, a_name, a_owner
                    else:
                        w_id, w_name, w_owner = 0, "TIE", "TIE"

                    raw_type = str(getattr(match, 'matchup_type', 'REGULAR')).upper().strip()
                    if 'WINNERS_BRACKET' in raw_type:
                        m_type = "PLAYOFF"
                    elif any(k in raw_type for k in ['LOSER', 'CONSOLATION', 'LADDER', 'TOILET']):
                        m_type = "CONSOLATION"
                    elif raw_type in ['NONE', 'REGULAR', '']:
                        m_type = "REGULAR"
                    else:
                        m_type = "PLAYOFF"

                    cursor.execute('INSERT INTO matchups VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                   (year, week, m_type, h_id, h_name, h_owner, h_score,
                                    a_id, a_name, a_owner, a_score, w_id, w_name, w_owner, margin))
                    matchup_count += 1

                    if hasattr(match, 'home_lineup') and match.home_lineup:
                        for p in match.home_lineup:
                            cursor.execute('INSERT INTO player_box_scores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                           (year, week, h_name, h_owner, p.name, p.position, p.slot_position, p.points, p.projected_points))

                    if hasattr(match, 'away_lineup') and match.away_lineup:
                        for p in match.away_lineup:
                            cursor.execute('INSERT INTO player_box_scores VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                           (year, week, a_name, a_owner, p.name, p.position, p.slot_position, p.points, p.projected_points))

            if matchup_count > 0:
                print(f"   [✓] Season {year} extracted via espn-api ({matchup_count} matchups)")
            else:
                extract_pre2019_direct(year)
                print(f"   [✓] Season {year} extracted via direct leagueHistory fallback")
        except Exception:
            extract_pre2019_direct(year)
            print(f"   [✓] Season {year} extracted via direct leagueHistory fallback")

    conn.commit()

conn.close()
print("\nExtraction complete! All database tables updated.")