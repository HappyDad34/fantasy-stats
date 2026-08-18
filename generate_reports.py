import sqlite3
import json
import pandas as pd

conn = sqlite3.connect("league_history.db")

# ---------------------------------------------------------
# 1. ALL-TIME FRANCHISE STANDINGS
# ---------------------------------------------------------
# Standardize home and away games into a single view
df_home = pd.read_sql_query("""
    SELECT year, week, home_team AS team, home_score AS score, away_team AS opponent, 
           away_score AS opp_score, 
           CASE WHEN home_score > away_score THEN 1 ELSE 0 END AS win,
           CASE WHEN home_score < away_score THEN 1 ELSE 0 END AS loss,
           CASE WHEN home_score = away_score THEN 1 ELSE 0 END AS tie
    FROM matchups
""", conn)

df_away = pd.read_sql_query("""
    SELECT year, week, away_team AS team, away_score AS score, home_team AS opponent, 
           home_score AS opp_score, 
           CASE WHEN away_score > home_score THEN 1 ELSE 0 END AS win,
           CASE WHEN away_score < home_score THEN 1 ELSE 0 END AS loss,
           CASE WHEN away_score = home_score THEN 1 ELSE 0 END AS tie
    FROM matchups
""", conn)

df_all = pd.concat([df_home, df_away], ignore_index=True)

# Group all-time franchise totals
standings = df_all.groupby('team').agg(
    Games=('win', 'count'),
    Wins=('win', 'sum'),
    Losses=('loss', 'sum'),
    Ties=('tie', 'sum'),
    Points_For=('score', 'sum'),
    Points_Against=('opp_score', 'sum')
).reset_index()

standings['Win_Pct'] = (standings['Wins'] + (0.5 * standings['Ties'])) / standings['Games']
standings['Avg_PPG'] = standings['Points_For'] / standings['Games']
standings['Avg_PAPG'] = standings['Points_Against'] / standings['Games']
standings = standings.sort_values(by=['Win_Pct', 'Points_For'], ascending=[False, False]).round(2)

print("\n================ ALL-TIME STANDINGS ================")
print(standings.to_string(index=False))

# ---------------------------------------------------------
# 2. ALL-TIME HEAD-TO-HEAD MATRIX
# ---------------------------------------------------------
h2h = df_all.groupby(['team', 'opponent']).agg(
    Wins=('win', 'sum'),
    Losses=('loss', 'sum'),
    Ties=('tie', 'sum'),
    Total_Games=('win', 'count')
).reset_index()

def format_record(row):
    return f"{row['Wins']}-{row['Losses']}" + (f"-{row['Ties']}" if row['Ties'] > 0 else "")

h2h['Record'] = h2h.apply(format_record, axis=1)
h2h_matrix = h2h.pivot(index='team', columns='opponent', values='Record').fillna("-")

print("\n================ HEAD-TO-HEAD MATRIX ================")
print(h2h_matrix.to_string())

# ---------------------------------------------------------
# 3. LEAGUE RECORD BOOK & EXTREMES
# ---------------------------------------------------------
print("\n================ LEAGUE RECORD BOOK ================")

# Top 5 Highest Single-Game Scores
top_scores = df_all.sort_values(by='score', ascending=False).head(5)
print("\nTop 5 Highest Single-Game Scores:")
for _, r in top_scores.iterrows():
    print(f"  {r['score']} pts - {r['team']} (Year {r['year']}, Wk {r['week']}) vs {r['opponent']}")

# Worst "Bad Beats" (Highest Points in a Loss)
bad_beats = df_all[df_all['loss'] == 1].sort_values(by='score', ascending=False).head(5)
print("\nTop 5 Heartbreaking Losses (Highest Score in a Loss):")
for _, r in bad_beats.iterrows():
    print(f"  {r['score']} pts - {r['team']} (Year {r['year']}, Wk {r['week']}) LOST to {r['opponent']} ({r['opp_score']} pts)")

# Luckiest Wins (Lowest Points in a Win)
lucky_wins = df_all[df_all['win'] == 1].sort_values(by='score', ascending=True).head(5)
print("\nTop 5 Lucky Escapes (Lowest Score in a Win):")
for _, r in lucky_wins.iterrows():
    print(f"  {r['score']} pts - {r['team']} (Year {r['year']}, Wk {r['week']}) DEFEATED {r['opponent']} ({r['opp_score']} pts)")

# Biggest Blowouts
matchups_df = pd.read_sql_query("SELECT year, week, home_team, home_score, away_team, away_score, margin, winner FROM matchups", conn)
blowouts = matchups_df.sort_values(by='margin', ascending=False).head(5)
print("\nTop 5 Biggest Blowouts:")
for _, r in blowouts.iterrows():
    loser = r['away_team'] if r['winner'] == r['home_team'] else r['home_team']
    print(f"  Margin: {r['margin']} pts - {r['winner']} def. {loser} (Year {r['year']}, Wk {r['week']})")

# ---------------------------------------------------------
# 4. EXPORT TO JSON FOR YOUR WEBSITE
# ---------------------------------------------------------
export_payload = {
    "all_time_standings": standings.to_dict(orient="records"),
    "head_to_head": h2h.to_dict(orient="records"),
    "records": {
        "highest_scores": top_scores[['year', 'week', 'team', 'opponent', 'score']].to_dict(orient="records"),
        "bad_beats": bad_beats[['year', 'week', 'team', 'opponent', 'score', 'opp_score']].to_dict(orient="records"),
        "lucky_wins": lucky_wins[['year', 'week', 'team', 'opponent', 'score', 'opp_score']].to_dict(orient="records"),
        "blowouts": blowouts[['year', 'week', 'winner', 'home_team', 'away_team', 'home_score', 'away_score', 'margin']].to_dict(orient="records")
    }
}

with open("league_stats_web.json", "w") as f:
    json.dump(export_payload, f, indent=2)

print("\nSuccessfully generated 'league_stats_web.json' for web frontend integration.")
conn.close()