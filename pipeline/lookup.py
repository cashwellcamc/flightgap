"""Look up one flight and put it in context: the manual UA1546 investigation, automated.

Usage:
    python pipeline/lookup.py --date 2024-05-01 --carrier UA --flight 1546
"""

import argparse

from db import connect

CODES = {"A": "Carrier", "B": "Weather", "C": "National Air System", "D": "Security"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--date", required=True)
    ap.add_argument("--carrier", required=True)
    ap.add_argument("--flight", required=True, type=float)
    a = ap.parse_args()
    con = connect()

    rows = con.execute(
        """SELECT * FROM flights
           WHERE flight_date = ?::DATE AND carrier = ? AND flight_number = ?""",
        [a.date, a.carrier, a.flight],
    ).fetchdf()

    if rows.empty:
        print("Not found in the federal data. Possible reasons: foreign airline, international flight,")
        print("operated by a regional partner (try that carrier code), or month not downloaded yet.")
        return

    for _, f in rows.iterrows():
        print(f"\n{a.carrier}{int(a.flight)}  {f.origin} -> {f.dest}  {a.date}")
        print(f"  scheduled dep {int(f.sched_dep):04d}, scheduled time {f.sched_elapsed_min:.0f} min")
        print(f"  tail number:  {f.tail_number or '(none assigned)'}")
        if f.cancelled:
            code = f.cancellation_code
            print(f"  CANCELLED - reported cause: {code} ({CODES.get(code, '?')})")
        else:
            print(f"  operated - arrival delay {f.arr_delay_min:.0f} min")

        ctx = con.execute(
            """
            SELECT
              count(*) FILTER (WHERE carrier = $c)                                         AS carrier_flights,
              count(*) FILTER (WHERE carrier = $c AND cancelled)                           AS carrier_cxl,
              count(*) FILTER (WHERE carrier = $c AND cancelled AND cancellation_code='B') AS carrier_wx_cxl,
              count(*) FILTER (WHERE (origin = $o OR dest = $o) AND cancelled AND cancellation_code='B') AS origin_wx_cxl_all_airlines,
              count(*) FILTER (WHERE (origin = $d OR dest = $d) AND cancelled AND cancellation_code='B') AS dest_wx_cxl_all_airlines
            FROM flights WHERE flight_date = $dt::DATE
            """,
            {"c": a.carrier, "o": f.origin, "d": f.dest, "dt": a.date},
        ).fetchone()
        print(f"\n  Context for {a.date}:")
        print(f"    {a.carrier} flights nationwide:              {ctx[0]:,}")
        print(f"    {a.carrier} cancellations nationwide:        {ctx[1]}")
        print(f"    {a.carrier} weather cancellations nationwide: {ctx[2]}")
        print(f"    weather cancellations touching {f.origin} (all airlines): {ctx[3]}")
        print(f"    weather cancellations touching {f.dest} (all airlines): {ctx[4]}")

        freq = con.execute(
            """SELECT count(*) FROM flights
               WHERE carrier = ? AND flight_number = ? AND origin = ? AND dest = ?
                 AND date_trunc('month', flight_date) = date_trunc('month', ?::DATE)""",
            [a.carrier, a.flight, f.origin, f.dest, a.date],
        ).fetchone()[0]
        print(f"    times this flight number ran this route that month: {freq}")

        if f.cancelled and f.cancellation_code == "B" and ctx[2] <= 1 and ctx[3] + ctx[4] <= 2:
            print("\n  >> FLAG: isolated weather cancellation - no matching weather disruption elsewhere.")
            print("     Next step (week 2): check actual weather observations at both airports.")


if __name__ == "__main__":
    main()
