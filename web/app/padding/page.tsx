"use client";

import { useState } from "react";

const API = "http://localhost:8000";

interface PaddingRow {
  carrier: string;
  route: string;
  yr: number;
  flights: number;
  avg_sched_min: number;
  median_actual_min: number;
  padding_min: number;
  pct_60min_late: number;
  p90_arr_delay_min: number;
}

function padColor(min: number) {
  if (min >= 20) return "text-red-400";
  if (min >= 10) return "text-amber-400";
  if (min < 0) return "text-emerald-400";
  return "text-zinc-200";
}

export default function PaddingPage() {
  const [route, setRoute] = useState("SAN-EWR");
  const [rows, setRows] = useState<PaddingRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRows(null);
    try {
      const param = route.trim() ? `&route=${route.trim().toUpperCase()}` : "";
      const res = await fetch(`${API}/api/padding?limit=50${param}`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setRows(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold mb-1">Schedule padding</h1>
        <p className="text-zinc-500 text-sm">
          Scheduled time minus median actual time. Rising padding with flat actual times = on-time skimflation.
        </p>
      </div>

      <form onSubmit={search} className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Route (optional)
          <input
            type="text"
            value={route}
            onChange={(e) => setRoute(e.target.value.toUpperCase())}
            placeholder="SAN-EWR"
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 w-32 focus:outline-none focus:border-zinc-500 uppercase"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 bg-zinc-100 text-zinc-900 rounded text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors"
        >
          {loading ? "loading…" : "Search"}
        </button>
        {route && (
          <button
            type="button"
            onClick={() => { setRoute(""); setRows(null); }}
            className="px-3 py-2 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
          >
            clear
          </button>
        )}
      </form>

      {error && (
        <p className="text-red-400 text-sm">Error: {error} — is the API running? <code className="text-zinc-500">uvicorn pipeline.api:app --reload</code></p>
      )}

      {rows && rows.length === 0 && (
        <p className="text-zinc-500 text-sm">No results (need ≥50 operated flights).</p>
      )}

      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 text-xs uppercase tracking-wider border-b border-zinc-800">
                <th className="text-left py-2 pr-4">Carrier</th>
                <th className="text-left py-2 pr-4">Route</th>
                <th className="text-right py-2 pr-4">Year</th>
                <th className="text-right py-2 pr-4">Flights</th>
                <th className="text-right py-2 pr-4">Sched min</th>
                <th className="text-right py-2 pr-4">Actual med</th>
                <th className="text-right py-2 pr-4">Padding</th>
                <th className="text-right py-2 pr-4">% 60min+</th>
                <th className="text-right py-2">p90 delay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-zinc-900/50 transition-colors">
                  <td className="py-2 pr-4 text-zinc-300">{r.carrier}</td>
                  <td className="py-2 pr-4 text-zinc-300">{r.route}</td>
                  <td className="py-2 pr-4 text-right text-zinc-400">{r.yr}</td>
                  <td className="py-2 pr-4 text-right text-zinc-400">{r.flights.toLocaleString()}</td>
                  <td className="py-2 pr-4 text-right text-zinc-400">{r.avg_sched_min}</td>
                  <td className="py-2 pr-4 text-right text-zinc-400">{r.median_actual_min}</td>
                  <td className={`py-2 pr-4 text-right font-medium ${padColor(r.padding_min)}`}>
                    {r.padding_min > 0 ? "+" : ""}{r.padding_min}
                  </td>
                  <td className="py-2 pr-4 text-right text-zinc-400">{r.pct_60min_late}%</td>
                  <td className="py-2 text-right text-zinc-400">{r.p90_arr_delay_min}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
