"""FastAPI backend — exposes pipeline queries as JSON endpoints."""

import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import pandas as pd
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import connect


def _py(v):
    """Convert numpy scalars to native Python types for JSON serialization."""
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        return None if np.isnan(v) else float(v)
    if isinstance(v, np.bool_):
        return bool(v)
    return v


def _val(v):
    """Return None for NA/NaN, otherwise return as a native Python type."""
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    return _py(v)


def _sanitize_rows(rows: list[dict]) -> list[dict]:
    return [{k: _val(v) for k, v in row.items()} for row in rows]


app = FastAPI(title="flightgap")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

CODES = {"A": "Carrier", "B": "Weather", "C": "National Air System", "D": "Security"}


def _verdict(cancelled, code, other_wx, carrier_wx_today, carrier_wx_median,
             tail, freq, origin, dest, carrier):
    """Compute verdict + plain-English rules for a code-B cancellation."""
    if not cancelled or code != "B":
        return None

    rules = []

    # Rule 1: airport weather corroboration from other airlines
    if other_wx >= 3:
        rules.append({
            "text": f"{other_wx} other-airline weather cancellations touched {origin} or {dest} that day — weather event is corroborated by multiple carriers.",
            "positive": True,
        })
        r1 = True
    elif other_wx == 1:
        rules.append({
            "text": f"1 other-airline weather cancellation touched {origin} or {dest} that day — weak corroboration from outside this carrier.",
            "positive": None,
        })
        r1 = None
    else:
        rules.append({
            "text": f"No other airline reported a weather cancellation touching {origin} or {dest} that day — weather signal is absent.",
            "positive": False,
        })
        r1 = False

    # Rule 2: carrier rate vs monthly median
    median_str = f"{int(carrier_wx_median)}" if carrier_wx_median == int(carrier_wx_median) else f"{carrier_wx_median:.1f}"
    if carrier_wx_median > 0:
        ratio = carrier_wx_today / carrier_wx_median
        if ratio <= 1.5:
            rules.append({
                "text": f"{carrier} reported {carrier_wx_today} weather cancellation{'s' if carrier_wx_today != 1 else ''} today (monthly median: {median_str}) — rate is at or below baseline.",
                "positive": True,
            })
            r2 = True
        elif ratio <= 3.0:
            rules.append({
                "text": f"{carrier} reported {carrier_wx_today} weather cancellations today ({ratio:.1f}× its monthly median of {median_str}) — elevated but not extreme.",
                "positive": None,
            })
            r2 = None
        else:
            rules.append({
                "text": f"{carrier} reported {carrier_wx_today} weather cancellations today ({ratio:.1f}× its monthly median of {median_str}) — well above typical.",
                "positive": False,
            })
            r2 = False
    else:
        if carrier_wx_today == 0:
            rules.append({
                "text": "No weather cancellations reported by this carrier today and none typical for this month.",
                "positive": True,
            })
            r2 = True
        else:
            rules.append({
                "text": f"{carrier} reported {carrier_wx_today} weather cancellation{'s' if carrier_wx_today != 1 else ''} today; this carrier typically reports none this month — anomalous.",
                "positive": False,
            })
            r2 = False

    # Rule 3: tail number
    if tail:
        rules.append({
            "text": f"Tail number {tail} was recorded — aircraft had been allocated to this flight.",
            "positive": None,
        })
    else:
        rules.append({
            "text": "No tail number recorded — aircraft had not yet been assigned at time of cancellation.",
            "positive": None,
        })

    # Rule 4: route frequency
    if freq >= 20:
        rules.append({
            "text": f"This flight number served this route {freq} times this month — regular scheduled service.",
            "positive": True,
        })
    elif freq >= 5:
        rules.append({
            "text": f"This flight number served this route {freq} times this month — runs on selected days.",
            "positive": None,
        })
    else:
        word = "time" if freq == 1 else "times"
        rules.append({
            "text": f"This flight number served this route only {freq} {word} this month — infrequent service.",
            "positive": None,
        })

    # Overall verdict: airport corroboration is the primary signal
    if r1 is True and r2 is not False:
        label = "Plausible"
    elif r1 is False:
        label = "Suspicious"
    else:
        label = "Questionable"

    return {"label": label, "rules": rules}


@app.get("/api/flight")
def flight(
    date: str = Query(..., description="YYYY-MM-DD"),
    carrier: str = Query(...),
    flight: float = Query(...),
    origin: str = Query(None, description="Filter to this origin (optional)"),
    dest: str = Query(None, description="Filter to this dest (optional)"),
):
    con = connect()
    carrier_upper = carrier.upper()

    where = "flight_date = ?::DATE AND carrier = ? AND flight_number = ?"
    params: list = [date, carrier_upper, flight]
    if origin:
        where += " AND origin = ?"
        params.append(origin.upper())
    if dest:
        where += " AND dest = ?"
        params.append(dest.upper())

    rows = con.execute(f"SELECT * FROM flights WHERE {where}", params).fetchdf()

    if rows.empty:
        return {"found": False, "legs": []}

    # Monthly median for context baselines (one query covers all legs)
    med = con.execute(
        """
        SELECT
          median(daily_wx_cxl) AS carrier_wx_cxl_monthly_median,
          median(daily_cxl)    AS carrier_cxl_monthly_median
        FROM (
          SELECT flight_date,
            count(*) FILTER (WHERE cancelled AND cancellation_code = 'B') AS daily_wx_cxl,
            count(*) FILTER (WHERE cancelled)                              AS daily_cxl
          FROM flights
          WHERE carrier = ? AND date_trunc('month', flight_date) = date_trunc('month', ?::DATE)
          GROUP BY flight_date
        )
        """,
        [carrier_upper, date],
    ).fetchone()
    wx_median = float(med[0]) if med[0] is not None else 0.0
    cxl_median = float(med[1]) if med[1] is not None else 0.0

    legs = []
    for _, f in rows.iterrows():
        ctx = con.execute(
            """
            SELECT
              count(*) FILTER (WHERE carrier = $c)                                          AS carrier_flights,
              count(*) FILTER (WHERE carrier = $c AND cancelled)                            AS carrier_cxl,
              count(*) FILTER (WHERE carrier = $c AND cancelled AND cancellation_code='B')  AS carrier_wx_cxl,
              count(*) FILTER (WHERE (origin = $o OR dest = $o) AND cancelled AND cancellation_code='B') AS origin_wx_cxl,
              count(*) FILTER (WHERE (origin = $d OR dest = $d) AND cancelled AND cancellation_code='B') AS dest_wx_cxl,
              count(*) FILTER (WHERE carrier != $c
                AND (origin = $o OR dest = $o OR origin = $d OR dest = $d)
                AND cancelled AND cancellation_code='B')                                    AS other_carrier_wx_cxl_at_airports
            FROM flights WHERE flight_date = $dt::DATE
            """,
            {"c": carrier_upper, "o": f.origin, "d": f.dest, "dt": date},
        ).fetchone()

        freq = con.execute(
            """SELECT count(*) FROM flights
               WHERE carrier = ? AND flight_number = ? AND origin = ? AND dest = ?
                 AND date_trunc('month', flight_date) = date_trunc('month', ?::DATE)""",
            [carrier_upper, flight, f.origin, f.dest, date],
        ).fetchone()[0]

        cancelled = bool(f.cancelled)
        code = _val(f.cancellation_code)
        tail = _val(f.tail_number)

        carrier_wx_today = int(ctx[2])
        other_wx = int(ctx[5])

        v = _verdict(
            cancelled=cancelled,
            code=code,
            other_wx=other_wx,
            carrier_wx_today=carrier_wx_today,
            carrier_wx_median=wx_median,
            tail=tail,
            freq=int(freq),
            origin=f.origin,
            dest=f.dest,
            carrier=carrier_upper,
        )

        sched_dep = _val(f.sched_dep)
        legs.append({
            "carrier": carrier_upper,
            "flight_number": int(flight),
            "date": date,
            "origin": f.origin,
            "dest": f.dest,
            "sched_dep": int(sched_dep) if sched_dep is not None else None,
            "sched_elapsed_min": _val(f.sched_elapsed_min),
            "tail_number": tail,
            "cancelled": cancelled,
            "cancellation_code": code,
            "cancellation_label": CODES.get(code, "Unknown") if code else None,
            "arr_delay_min": _val(f.arr_delay_min),
            "context": {
                "carrier_flights": int(ctx[0]),
                "carrier_cancellations": int(ctx[1]),
                "carrier_cancellations_monthly_median": round(cxl_median, 1),
                "carrier_weather_cancellations": carrier_wx_today,
                "carrier_weather_cancellations_monthly_median": round(wx_median, 1),
                "origin_weather_cancellations_all_airlines": int(ctx[3]),
                "dest_weather_cancellations_all_airlines": int(ctx[4]),
                "other_carrier_weather_cancellations_at_airports": other_wx,
                "times_ran_this_route_this_month": int(freq),
            },
            "verdict": v,
        })

    # Sort: cancelled first, then by arrival delay descending, then operated
    def sort_key(leg):
        if leg["cancelled"]:
            return (0, 0)
        d = leg["arr_delay_min"]
        return (1, -(d if d is not None else 0))

    legs.sort(key=sort_key)
    return {"found": True, "legs": legs}


@app.get("/api/commitments/{carrier}")
def commitments(carrier: str):
    con = connect()
    rows = con.execute(
        """SELECT * FROM carrier_commitments WHERE carrier = ? ORDER BY snapshot_date DESC LIMIT 1""",
        [carrier.upper()],
    ).fetchdf()
    if rows.empty:
        return None
    r = rows.iloc[0]
    return {
        "carrier": r.carrier,
        "snapshot_date": str(r.snapshot_date),
        "meal_voucher": bool(r.meal_voucher),
        "hotel_overnight": bool(r.hotel_overnight),
        "ground_transport": bool(r.ground_transport),
        "rebook_other_airline": bool(r.rebook_other_airline),
        "cash_or_miles": bool(r.cash_or_miles),
        "est_meal_value_usd": _val(r.est_meal_value_usd),
        "est_hotel_value_usd": _val(r.est_hotel_value_usd),
        "source_url": _val(r.source_url),
        "verify_note": _val(r.verify_note),
    }


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


# ── Passenger reports ──────────────────────────────────────────────────────────

def _report_gaps(con, report_id: str) -> dict:
    owed = con.execute(
        "SELECT coalesce(sum(cash_equiv_usd), 0) FROM report_compensation_items WHERE report_id = ? AND is_owed_estimate = true",
        [report_id],
    ).fetchone()[0]
    received = con.execute(
        "SELECT coalesce(sum(cash_equiv_usd), 0) FROM report_compensation_items WHERE report_id = ? AND received = true AND is_owed_estimate = false",
        [report_id],
    ).fetchone()[0]
    return {
        "owed_usd": round(float(owed), 2),
        "received_usd": round(float(received), 2),
        "gap_usd": round(float(owed) - float(received), 2),
    }


def _report_row(r, gaps: dict, carriers: list[str]) -> dict:
    return {
        "report_id": r.report_id,
        "title": _val(r.title),
        "flight_date": str(r.flight_date),
        "carrier": r.carrier,
        "flight_number": _val(r.flight_number),
        "origin": r.origin,
        "dest": r.dest,
        "disruption": r.disruption,
        "reason_given": _val(r.reason_given),
        "notice_hours": _val(r.notice_hours),
        "planned_legs": _val(r.planned_legs),
        "actual_legs": _val(r.actual_legs),
        "final_arrival_delay_h": _val(r.final_arrival_delay_h),
        "offered": _val(r.offered),
        "received_value_usd": _val(r.received_value_usd),
        "days_to_resolve": _val(r.days_to_resolve),
        "complaints_filed": _val(r.complaints_filed),
        "escalations": _val(r.escalations),
        "created_at": str(r.created_at),
        "carriers_involved": carriers,
        "multi_carrier": len(set(carriers)) > 1,
        **gaps,
    }


@app.get("/api/reports")
def list_reports():
    con = connect()
    reports = con.execute(
        "SELECT * FROM passenger_reports ORDER BY flight_date DESC"
    ).fetchdf()
    result = []
    for _, r in reports.iterrows():
        gaps = _report_gaps(con, r.report_id)
        carriers = [
            row[0]
            for row in con.execute(
                "SELECT DISTINCT carrier FROM report_legs WHERE report_id = ? AND carrier IS NOT NULL",
                [r.report_id],
            ).fetchall()
        ]
        result.append(_report_row(r, gaps, carriers))
    return result


@app.get("/api/reports/{report_id}")
def get_report(report_id: str):
    con = connect()
    rows = con.execute(
        "SELECT * FROM passenger_reports WHERE report_id = ?", [report_id]
    ).fetchdf()
    if rows.empty:
        raise HTTPException(404, "report not found")
    r = rows.iloc[0]
    gaps = _report_gaps(con, report_id)

    legs = _sanitize_rows(con.execute(
        "SELECT * FROM report_legs WHERE report_id = ? ORDER BY leg_type DESC, leg_seq",
        [report_id],
    ).fetchdf().to_dict(orient="records"))

    items = _sanitize_rows(con.execute(
        "SELECT * FROM report_compensation_items WHERE report_id = ? ORDER BY item_seq",
        [report_id],
    ).fetchdf().to_dict(orient="records"))

    carriers = [row[0] for row in con.execute(
        "SELECT DISTINCT carrier FROM report_legs WHERE report_id = ? AND carrier IS NOT NULL",
        [report_id],
    ).fetchall()]

    jurisdictions = list({leg.get("jurisdiction") for leg in legs if leg.get("jurisdiction") and leg.get("jurisdiction") != "NONE"})

    liability_gap_note = None
    if len(set(carriers)) > 1:
        liability_gap_note = (
            f"Multiple carriers involved ({', '.join(sorted(set(carriers)))}). "
            "Each airline is typically liable only for disruptions on its own operated leg. "
            "When a cancellation on one carrier causes a missed connection on another, "
            "no single carrier may own the full end-to-end delay."
        )

    return {
        **_report_row(r, gaps, carriers),
        "legs": legs,
        "compensation_items": items,
        "jurisdictions": jurisdictions,
        "liability_gap_note": liability_gap_note,
    }


class ReportSubmission(BaseModel):
    flight_date: str
    carrier: str
    flight_number: str | None = None
    origin: str
    dest: str
    disruption: str
    reason_given: str | None = None
    notice_hours: float | None = None
    planned_legs: int = 1
    actual_legs: int | None = None
    final_arrival_delay_h: float | None = None
    offered: str | None = None
    received_value_usd: float = 0.0
    days_to_resolve: int = 0
    complaints_filed: int = 0
    escalations: int = 0


@app.post("/api/reports")
def submit_report(body: ReportSubmission):
    con = connect()
    report_id = f"rpt_{uuid.uuid4().hex[:12]}"
    title = f"{body.carrier}{body.flight_number or ''} {body.origin}→{body.dest} {body.flight_date}"
    con.execute(
        """INSERT INTO passenger_reports
           (report_id, title, flight_date, carrier, flight_number, origin, dest,
            disruption, reason_given, notice_hours, planned_legs, actual_legs,
            final_arrival_delay_h, offered, received_value_usd,
            days_to_resolve, complaints_filed, escalations)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        [
            report_id, title, body.flight_date, body.carrier.upper(),
            body.flight_number, body.origin.upper(), body.dest.upper(),
            body.disruption, body.reason_given, body.notice_hours,
            body.planned_legs, body.actual_legs, body.final_arrival_delay_h,
            body.offered, body.received_value_usd,
            body.days_to_resolve, body.complaints_filed, body.escalations,
        ],
    )
    return {"report_id": report_id}
