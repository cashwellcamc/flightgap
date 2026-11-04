"""Download BTS Reporting Carrier On-Time Performance monthly files and convert to Parquet.

Usage:
    python pipeline/download_bts.py --start 2024-01 --end 2024-12
    python pipeline/download_bts.py --start 2024-05 --end 2024-05   # one month

Each month: ~30-40 MB zip -> ~600k rows -> one Parquet file in data/parquet/ontime/.
Already-converted months are skipped, so re-running is safe.
"""

import argparse
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PARQUET_DIR = ROOT / "data" / "parquet" / "ontime"

URL = (
    "https://transtats.bts.gov/PREZIP/"
    "On_Time_Reporting_Carrier_On_Time_Performance_1987_present_{year}_{month}.zip"
)

# Columns we keep from the ~110 in the raw file, renamed to snake_case.
COLUMNS = {
    "FlightDate": "flight_date",
    "Reporting_Airline": "carrier",
    "Tail_Number": "tail_number",
    "Flight_Number_Reporting_Airline": "flight_number",
    "Origin": "origin",
    "Dest": "dest",
    "CRSDepTime": "sched_dep",
    "DepTime": "actual_dep",
    "DepDelay": "dep_delay_min",
    "CRSArrTime": "sched_arr",
    "ArrTime": "actual_arr",
    "ArrDelay": "arr_delay_min",
    "Cancelled": "cancelled",
    "CancellationCode": "cancellation_code",
    "Diverted": "diverted",
    "CRSElapsedTime": "sched_elapsed_min",
    "ActualElapsedTime": "actual_elapsed_min",
    "Distance": "distance_mi",
    "CarrierDelay": "carrier_delay_min",
    "WeatherDelay": "weather_delay_min",
    "NASDelay": "nas_delay_min",
    "SecurityDelay": "security_delay_min",
    "LateAircraftDelay": "late_aircraft_delay_min",
}


def months(start: str, end: str):
    y, m = map(int, start.split("-"))
    ey, em = map(int, end.split("-"))
    while (y, m) <= (ey, em):
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


def select_sql() -> str:
    cols = []
    for src, dst in COLUMNS.items():
        if dst == "flight_date":
            cols.append(f'CAST("{src}" AS DATE) AS {dst}')
        elif dst in ("cancelled", "diverted"):
            cols.append(f'CAST(CAST("{src}" AS DOUBLE) AS BOOLEAN) AS {dst}')
        elif dst in ("carrier", "tail_number", "origin", "dest", "cancellation_code"):
            cols.append(f'NULLIF(TRIM(CAST("{src}" AS VARCHAR)), \'\') AS {dst}')
        else:
            cols.append(f'TRY_CAST("{src}" AS DOUBLE) AS {dst}')
    return ",\n    ".join(cols)


def csv_to_parquet(csv_path: Path, out_path: Path) -> int:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect()
    con.execute(
        f"""
        COPY (
          SELECT
            {select_sql()}
          FROM read_csv('{csv_path.as_posix()}', header=true, all_varchar=true)
        ) TO '{out_path.as_posix()}' (FORMAT parquet, COMPRESSION zstd)
        """
    )
    n = con.execute(f"SELECT count(*) FROM '{out_path.as_posix()}'").fetchone()[0]
    con.close()
    return n


def fetch_month(year: int, month: int) -> None:
    out = PARQUET_DIR / f"ontime_{year}_{month:02d}.parquet"
    if out.exists():
        print(f"{year}-{month:02d}: already have it, skipping")
        return

    url = URL.format(year=year, month=month)
    print(f"{year}-{month:02d}: downloading {url}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "flightgap-pipeline"})
        with urllib.request.urlopen(req, timeout=300) as resp:
            blob = resp.read()
    except Exception as e:  # BTS is occasionally flaky; report and move on
        print(f"  failed: {e}", file=sys.stderr)
        return

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        csv_name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
        csv_path = RAW_DIR / f"ontime_{year}_{month:02d}.csv"
        csv_path.write_bytes(zf.read(csv_name))

    n = csv_to_parquet(csv_path, out)
    csv_path.unlink()  # keep only the parquet; raw CSVs are ~250 MB each
    print(f"  wrote {out.name} ({n:,} flights)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", required=True, help="YYYY-MM")
    ap.add_argument("--end", help="YYYY-MM (defaults to --start)")
    ap.add_argument("--from-csv", help="convert a manually downloaded raw CSV instead (use with --start only)")
    args = ap.parse_args()

    if args.from_csv:
        y, m = map(int, args.start.split("-"))
        out = PARQUET_DIR / f"ontime_{y}_{m:02d}.parquet"
        n = csv_to_parquet(Path(args.from_csv), out)
        print(f"wrote {out.name} ({n:,} flights)")
        return

    for y, m in months(args.start, args.end or args.start):
        fetch_month(y, m)


if __name__ == "__main__":
    main()
