# flightgap (working name)

Airline reliability, measured from the passenger's side.

Airlines report flights. Passengers experience trips. This project reconciles official federal
data (BTS / DOT) with what actually happens to travelers, and measures the gaps:

- **Schedule padding** — scheduled flight times creeping up so late flights still count as "on time"
- **Cause-code plausibility** — "weather" cancellations on days with no weather anywhere near the flight
- **Real reliability** — 60+ min delays and 90th-percentile delay, not the 15-minute "on time" stat
- **Compensation gap** — what passengers were owed (law + the airline's own DOT commitments) vs. what they got
- **Liability dodged** — care obligations an airline avoids by coding a cancellation as weather

Seed case: UA1546 SAN→EWR, 1 May 2024. Cancelled at the gate, coded **weather**. It was United's
only weather cancellation nationwide that day, the only cancelled arrival into EWR from any airline,
and no aircraft was ever assigned. Passenger compensation: $0.

## Structure

```
pipeline/   Python + DuckDB: download, clean, analyze
  download_bts.py   bulk-download BTS monthly on-time files -> Parquet
  lookup.py         look up one flight + its context, flag implausible weather codes
  padding.py        schedule padding & real-reliability by carrier/route/year
  db.py             DuckDB views + compensation tables
  sql/              schema
  seeds/            statutory compensation rules (EU261, UK261, Canada APPR)
web/        Next.js app (week 3)
data/       local data, git-ignored
```

## Setup (Mac)

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r pipeline/requirements.txt

# grab one month first to make sure it works (~1 min)
python pipeline/download_bts.py --start 2024-05 --end 2024-05

# the seed case
python pipeline/lookup.py --date 2024-05-01 --carrier UA --flight 1546

# padding on a route
python pipeline/padding.py --route SAN-EWR

# then backfill (each month ~30-40 MB download, ~15 MB parquet)
python pipeline/download_bts.py --start 2022-01 --end 2025-12
```

If the BTS download fails, download the month manually from TranStats ("Prezipped File" option)
and convert it with `--from-csv path/to/file.csv --start 2024-05`.

## Roadmap

- [x] Week 1 — ingest BTS, flight lookup, padding query
- [ ] Week 2 — join hourly airport weather (Iowa Environmental Mesonet ASOS archive), score every weather cancellation
- [ ] Week 3 — Next.js: airline scorecard, route page, flight lookup
- [ ] Week 4 — compensation checker, crowdsourced passenger reports, deploy

## Data sources

- BTS Reporting Carrier On-Time Performance (1987–present) — US carriers, domestic flights
- Iowa Environmental Mesonet ASOS archive — hourly airport weather observations
- DOT Airline Customer Service Dashboard — each airline's controllable-disruption commitments
- DOT Air Travel Consumer Report — complaints, mishandled bags (phase 2)
