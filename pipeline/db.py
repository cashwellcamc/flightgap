"""Shared DuckDB connection: views over the Parquet files + compensation tables."""

from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "flightgap.duckdb"
PARQUET_GLOB = (ROOT / "data" / "parquet" / "ontime" / "*.parquet").as_posix()
SQL_DIR = Path(__file__).resolve().parent / "sql"
SEED_DIR = Path(__file__).resolve().parent / "seeds"


def connect() -> duckdb.DuckDBPyConnection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(DB_PATH.as_posix())
    con.execute(f"CREATE VIEW IF NOT EXISTS flights AS SELECT * FROM read_parquet('{PARQUET_GLOB}')")
    con.execute((SQL_DIR / "compensation_schema.sql").read_text())
    _migrate(con)
    _seed(con)
    return con


def _migrate(con) -> None:
    """Add columns introduced after the initial schema without dropping existing data."""
    _add_col_if_missing(con, "carrier_commitments", "verify_note", "VARCHAR")
    _add_col_if_missing(con, "passenger_reports", "title", "VARCHAR")
    _add_col_if_missing(con, "passenger_reports", "escalations", "INTEGER")

    for tbl in ("report_legs", "report_compensation_items"):
        if not _table_exists(con, tbl):
            con.execute((SQL_DIR / "compensation_schema.sql").read_text())
            break


def _table_exists(con, name: str) -> bool:
    return bool(
        con.execute(
            "SELECT count(*) FROM information_schema.tables WHERE table_name = ?", [name]
        ).fetchone()[0]
    )


def _add_col_if_missing(con, table: str, col: str, col_type: str) -> None:
    existing = {
        r[0]
        for r in con.execute(
            "SELECT column_name FROM information_schema.columns WHERE table_name = ?", [table]
        ).fetchall()
    }
    if col not in existing:
        con.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}")


def _seed(con) -> None:
    if con.execute("SELECT count(*) FROM compensation_rules").fetchone()[0] == 0:
        con.execute(
            f"INSERT INTO compensation_rules SELECT * FROM read_csv('{(SEED_DIR / 'compensation_rules.csv').as_posix()}', header=true)"
        )

    if con.execute("SELECT count(*) FROM carrier_commitments").fetchone()[0] == 0:
        con.execute(
            f"INSERT INTO carrier_commitments SELECT * FROM read_csv('{(SEED_DIR / 'carrier_commitments.csv').as_posix()}', header=true)"
        )

    if con.execute("SELECT count(*) FROM passenger_reports").fetchone()[0] == 0:
        _seed_reports(con)


def _seed_reports(con) -> None:
    from seeds.reports_seed import REPORTS, REPORT_LEGS, COMPENSATION_ITEMS  # type: ignore

    for r in REPORTS:
        con.execute(
            """INSERT INTO passenger_reports
               (report_id, title, flight_date, carrier, flight_number, origin, dest,
                disruption, reason_given, notice_hours, planned_legs, actual_legs,
                final_arrival_delay_h, offered, received_value_usd,
                days_to_resolve, complaints_filed, escalations)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [
                r["report_id"], r["title"], r["flight_date"], r["carrier"],
                r.get("flight_number"), r["origin"], r["dest"],
                r["disruption"], r["reason_given"], r.get("notice_hours"),
                r["planned_legs"], r["actual_legs"], r.get("final_arrival_delay_h"),
                r["offered"], r["received_value_usd"],
                r["days_to_resolve"], r["complaints_filed"], r["escalations"],
            ],
        )

    for leg in REPORT_LEGS:
        con.execute(
            """INSERT INTO report_legs
               (report_id, leg_seq, leg_type, carrier, flight_number, origin, dest,
                sched_dep, actual_dep, delay_min, disruption, jurisdiction, distance_km, notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            [
                leg["report_id"], leg["leg_seq"], leg["leg_type"],
                leg.get("carrier"), leg.get("flight_number"),
                leg.get("origin"), leg.get("dest"),
                leg.get("sched_dep"), leg.get("actual_dep"), leg.get("delay_min"),
                leg.get("disruption"), leg.get("jurisdiction"), leg.get("distance_km"),
                leg.get("notes"),
            ],
        )

    for item in COMPENSATION_ITEMS:
        con.execute(
            """INSERT INTO report_compensation_items
               (report_id, item_seq, carrier, item_type, description,
                face_value_usd, cash_equiv_usd, offered, received,
                restrictions, owed_basis, is_owed_estimate)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            [
                item["report_id"], item["item_seq"], item.get("carrier"),
                item["item_type"], item["description"],
                item.get("face_value_usd"), item.get("cash_equiv_usd"),
                item["offered"], item["received"],
                item.get("restrictions"), item.get("owed_basis"),
                item["is_owed_estimate"],
            ],
        )
