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
    con.execute(f"CREATE OR REPLACE VIEW flights AS SELECT * FROM read_parquet('{PARQUET_GLOB}')")
    con.execute((SQL_DIR / "compensation_schema.sql").read_text())
    _seed(con)
    return con


def _seed(con) -> None:
    if con.execute("SELECT count(*) FROM compensation_rules").fetchone()[0] == 0:
        con.execute(
            f"INSERT INTO compensation_rules SELECT * FROM read_csv('{(SEED_DIR / 'compensation_rules.csv').as_posix()}', header=true)"
        )
