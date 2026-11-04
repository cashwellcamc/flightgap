"""Schedule padding: are airlines stretching scheduled times so late flights count as 'on time'?

padding = average scheduled flight time - median actual flight time, per carrier/route/year.
Rising padding with flat actual times = on-time skimflation.

Usage:
    python pipeline/padding.py                       # top routes overall
    python pipeline/padding.py --route SAN-EWR
"""

import argparse

from db import connect


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--route", help="ORIGIN-DEST, e.g. SAN-EWR")
    ap.add_argument("--limit", type=int, default=25)
    a = ap.parse_args()
    con = connect()

    where = "NOT cancelled AND NOT diverted AND actual_elapsed_min IS NOT NULL"
    params = []
    if a.route:
        o, d = a.route.upper().split("-")
        where += " AND origin = ? AND dest = ?"
        params = [o, d]

    df = con.execute(
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
        LIMIT {a.limit}
        """,
        params,
    ).fetchdf()
    print(df.to_string(index=False))


if __name__ == "__main__":
    main()
