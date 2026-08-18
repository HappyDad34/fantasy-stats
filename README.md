\# 🏈 ESPN Fantasy Football League History \& Analytics Vault



An interactive, high-performance analytics web dashboard and historical archive for ESPN Fantasy Football leagues. Extracts 9+ years of historical matchup data, rosters, and player box scores via the ESPN v3 API, storing structured records in SQLite and rendering an offline-first single-page application.



\---



\## 🌟 Key Features



\* \*\*13 Interactive Tab Views:\*\* Comprehensive records ranging from All-Time Standings and Head-to-Head grids to Dream Teams and Bad Beat registries.

\* \*\*Dual-Engine Ingestion Pipeline:\*\* Automated parsing using `espn-api` for modern seasons (2019+) alongside direct authenticated HTTP requests against ESPN's `/leagueHistory/` API for legacy seasons (pre-2019).

\* \*\*Co-Manager Disambiguation \& Alias Mapping:\*\* Consolidates multi-year team name changes and resolved human co-owners under persistent manager identities.

\* \*\*True Playoff Tier Separation:\*\* Distinguishes Championship Playoff matchups (`WINNERS\_BRACKET`) from Toilet Bowl / Consolation ladder games (`LOSERS\_CONSOLATION\_LADDER`).

\* \*\*Weekly Lineup Inspector:\*\* Interactive modal to drill down into any historical week's starters and benched players with individual scoring outputs.

\* \*\*Visual Analytics Suite:\*\* Chart.js powered cumulative scoring race charts, Luck vs. Skill scatter plots, and floor-to-ceiling consistency ranges.



\---



\## 🏗️ Repository Architecture



```text

├── extract\_history.py     # Ingestion engine (ESPN API -> SQLite league\_history.db)

├── generate\_site\_data.py  # Aggregation pipeline (SQLite -> data.json)

├── index.html             # Single-page dashboard interface (Tailwind CSS + Chart.js)

├── app.js                 # Reactive frontend application \& visualization logic

├── data.json              # Compiled league dataset payload

├── league\_history.db      # Local SQLite database cache

├── requirements.txt       # Python package dependencies

└── README.md              # Project documentation

