"use client";

import { useState } from "react";

const API = "http://localhost:8000";

interface FlightContext {
  carrier_flights: number;
  carrier_cancellations: number;
  carrier_weather_cancellations: number;
  origin_weather_cancellations_all_airlines: number;
  dest_weather_cancellations_all_airlines: number;
  times_ran_this_route_this_month: number;
}

interface Leg {
  carrier: string;
  flight_number: number;
  date: string;
  origin: string;
  dest: string;
  sched_dep: number | null;
  sched_elapsed_min: number | null;
  tail_number: string | null;
  cancelled: boolean;
  cancellation_code: string | null;
  cancellation_label: string | null;
  arr_delay_min: number | null;
  context: FlightContext;
  flag_isolated_weather: boolean;
}

interface FlightResult {
  found: boolean;
  legs: Leg[];
}

function fmtTime(t: number | null) {
  if (t == null) return "—";
  const h = Math.floor(t / 100).toString().padStart(2, "0");
  const m = (t % 100).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function Row({
  label,
  value,
  dim,
  highlight,
}: {
  label: string;
  value: string | number;
  dim?: boolean;
  highlight?: "red" | "green" | "amber";
}) {
  const valueClass =
    highlight === "red"
      ? "text-red-400"
      : highlight === "green"
      ? "text-emerald-400"
      : highlight === "amber"
      ? "text-amber-400"
      : dim
      ? "text-zinc-600"
      : "text-zinc-200";

  return (
    <div className="flex justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function LegCard({ leg }: { leg: Leg }) {
  const ctx = leg.context;
  return (
    <div className="border border-zinc-800 rounded-lg p-5 space-y-4">
      {leg.flag_isolated_weather && (
        <div className="bg-amber-950 border border-amber-700 text-amber-300 rounded px-4 py-3 text-sm">
          <span className="font-semibold">FLAG:</span> Isolated weather cancellation — no matching disruption elsewhere on this date. Verify airport weather observations.
        </div>
      )}

      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-xl font-semibold">
          {leg.carrier}{leg.flight_number}
        </span>
        <span className="text-zinc-300">{leg.origin} → {leg.dest}</span>
        <span className="text-zinc-500 text-sm">{leg.date}</span>
      </div>

      <div className="space-y-1 text-sm">
        <Row label="Scheduled dep" value={fmtTime(leg.sched_dep)} />
        <Row label="Scheduled time" value={leg.sched_elapsed_min != null ? `${leg.sched_elapsed_min} min` : "—"} />
        <Row label="Tail number" value={leg.tail_number ?? "(none assigned)"} dim={!leg.tail_number} />
        {leg.cancelled ? (
          <Row
            label="Status"
            value={`CANCELLED — ${leg.cancellation_code} (${leg.cancellation_label})`}
            highlight="red"
          />
        ) : (
          <Row
            label="Arrival delay"
            value={leg.arr_delay_min != null ? `${leg.arr_delay_min} min` : "—"}
            highlight={
              leg.arr_delay_min != null && leg.arr_delay_min >= 60
                ? "red"
                : leg.arr_delay_min != null && leg.arr_delay_min < 0
                ? "green"
                : undefined
            }
          />
        )}
      </div>

      <div className="border-t border-zinc-800 pt-4 space-y-1 text-sm">
        <p className="text-zinc-600 text-xs uppercase tracking-wider mb-2">Context — {leg.date}</p>
        <Row label={`${leg.carrier} flights nationwide`} value={ctx.carrier_flights.toLocaleString()} />
        <Row label={`${leg.carrier} cancellations nationwide`} value={ctx.carrier_cancellations} />
        <Row
          label={`${leg.carrier} weather cancellations nationwide`}
          value={ctx.carrier_weather_cancellations}
          highlight={ctx.carrier_weather_cancellations <= 1 ? "amber" : undefined}
        />
        <Row
          label={`Weather cancels touching ${leg.origin} (all airlines)`}
          value={ctx.origin_weather_cancellations_all_airlines}
          highlight={ctx.origin_weather_cancellations_all_airlines <= 1 ? "amber" : undefined}
        />
        <Row
          label={`Weather cancels touching ${leg.dest} (all airlines)`}
          value={ctx.dest_weather_cancellations_all_airlines}
          highlight={ctx.dest_weather_cancellations_all_airlines <= 1 ? "amber" : undefined}
        />
        <Row label="Times this route ran this month" value={ctx.times_ran_this_route_this_month} />
      </div>
    </div>
  );
}

export default function LookupPage() {
  const [date, setDate] = useState("2024-05-01");
  const [carrier, setCarrier] = useState("UA");
  const [flight, setFlight] = useState("1546");
  const [result, setResult] = useState<FlightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `${API}/api/flight?date=${date}&carrier=${carrier.toUpperCase()}&flight=${flight}`
      );
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold mb-1">Flight lookup</h1>
        <p className="text-zinc-500 text-sm">Look up a flight and check for suspicious disruption coding.</p>
      </div>

      <form onSubmit={lookup} className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Carrier
          <input
            type="text"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value.toUpperCase())}
            placeholder="UA"
            maxLength={3}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 w-20 focus:outline-none focus:border-zinc-500 uppercase"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Flight number
          <input
            type="number"
            value={flight}
            onChange={(e) => setFlight(e.target.value)}
            placeholder="1546"
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 w-28 focus:outline-none focus:border-zinc-500"
            required
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-zinc-100 text-zinc-900 rounded text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors"
        >
          {loading ? "searching…" : "Look up"}
        </button>
      </form>

      {error && (
        <p className="text-red-400 text-sm">Error: {error} — is the API running? <code className="text-zinc-500">uvicorn pipeline.api:app --reload</code></p>
      )}

      {result && !result.found && (
        <div className="text-zinc-500 text-sm space-y-1">
          <p>Not found in federal data.</p>
          <p className="text-zinc-600">Possible reasons: foreign airline, international flight, operated by a regional partner, or month not downloaded yet.</p>
        </div>
      )}

      {result?.found && (
        <div className="space-y-4">
          {result.legs.length > 1 && (
            <p className="text-zinc-500 text-sm">{result.legs.length} legs on this date</p>
          )}
          {result.legs.map((leg, i) => (
            <LegCard key={i} leg={leg} />
          ))}
        </div>
      )}
    </div>
  );
}
