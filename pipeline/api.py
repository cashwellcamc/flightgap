"""FastAPI backend — exposes pipeline queries as JSON endpoints.

Usage:
    uvicorn pipeline.api:app --reload --port 8000
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import pandas as pd
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from db import connect


def _val(v):
    """Return None for any pandas/float NaN, otherwise the value."""
    return None if pd.isna(v) else v

app = FastAPI(title="flightgap")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

CODES = {"A": "Carrier", "B": "Weather", "C": "National Air System", "D": "Security"}


@app.get("/api/flight")
def flight(
    date: str = Query(..., description="YYYY-MM-DD"),
    carrier: str = Query(...),
    flight: float = Query(...),
):
    con = connect()
    rows = con.execute(
        """SELECT * FROM flights
           WHERE flight_date = ?::DATE AND carrier = ? AND flight_number = ?""",
        [date, carrier.upper(), flight],
    ).fetchdf()

    if rows.empty:
        return {"found": False, "legs": []}

    legs = []
    for _, f in rows.iterrows():
        ctx = con.execute(
            """
            SELECT
              count(*) FILTER (WHERE carrier = $c)                                         AS carrier_flights,
              count(*) FILTER (WHERE carrier = $c AND cancelled)                           AS carrier_cxl,
              count(*) FILTER (WHERE carrier = $c AND cancelled AND cancellation_code='B') AS carrier_wx_cxl,
              count(*) FILTER (WHERE (origin = $o OR dest = $o) AND cancelled AND cancellation_code='B') AS origin_wx_cxl,
              count(*) FILTER (WHERE (origin = $d OR dest = $d) AND cancelled AND cancellation_code='B') AS dest_wx_cxl
            FROM flights WHERE flight_date = $dt::DATE
            """,
            {"c": carrier.upper(), "o": f.origin, "d": f.dest, "dt": date},
        ).fetchone()

        freq = con.execute(
            """SELECT count(*) FROM flights
               WHERE carrier = ? AND flight_number = ? AND origin = ? AND dest = ?
                 AND date_trunc('month', flight_date) = date_trunc('month', ?::DATE)""",
            [carrier.upper(), flight, f.origin, f.dest, date],
        ).fetchone()[0]

        cancelled = bool(f.cancelled)
        code = _val(f.cancellation_code)
        flag = (
            cancelled
            and code == "B"
            and ctx[2] <= 1
            and ctx[3] + ctx[4] <= 2
        )

        sched_dep = _val(f.sched_dep)
        legs.append({
            "carrier": carrier.upper(),
            "flight_number": int(flight),
            "date": date,
            "origin": f.origin,
            "dest": f.dest,
            "sched_dep": int(sched_dep) if sched_dep is not None else None,
            "sched_elapsed_min": _val(f.sched_elapsed_min),
            "tail_number": _val(f.tail_number),
            "cancelled": cancelled,
            "cancellation_code": code,
            "cancellation_label": CODES.get(code, "Unknown") if code else None,
            "arr_delay_min": _val(f.arr_delay_min),
            "context": {
                "carrier_flights": int(ctx[0]),
                "carrier_cancellations": int(ctx[1]),
                "carrier_weather_cancellations": int(ctx[2]),
                "origin_weather_cancellations_all_airlines": int(ctx[3]),
                "dest_weather_cancellations_all_airlines": int(ctx[4]),
                "times_ran_this_route_this_month": int(freq),
            },
            "flag_isolated_weather": flag,
        })

    return {"found": True, "legs": legs}


@app.get("/api/padding")
def padding(
    route: str = Query(None, description="ORIGIN-DEST, e.g. SAN-EWR"),
    limit: int = Query(25, le=200),
):
    con = connect()
    where = "NOT cancelled AND NOT diverted AND actual_elapsed_min IS NOT NULL"
    params: list = []

    if route:
        parts = route.upper().split("-")
        if len(parts) != 2:
            raise HTTPException(400, "route must be ORIGIN-DEST")
        where += " AND origin = ? AND dest = ?"
        params = parts

    rows = con.execute(
        f"""
        SELECT carrier, origin || '-' || dest AS route, year(flight_date) AS yr,
               count(*)                               AS flights,
               round(avg(sched_elapsed_min), 1)       AS avg_sched_min,
               round(median(actual_elapsed_min), 1)   AS median_actual_min,
               round(avg(sched_elapsed_min) - median(actual_elapsed_min), 1) AS padding_min,
               round(100.0 * avg((arr_delay_min >= 60)::INT), 1) AS pct_60min_late,
               round(quantile_cont(arr_delay_min, 0.9), 0)       AS p90_arr_delay_min
        FROM flights
        WHERE {where}
        GROUP BY ALL
        HAVING count(*) >= 50
        ORDER BY flights DESC, carrier, route, yr
        LIMIT {limit}
        """,
        params,
    ).fetchdf()

    return rows.to_dict(orient="records")
