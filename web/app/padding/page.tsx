"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

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

const CARRIER_COLORS = [
  "#60a5fa", // blue
  "#34d399", // emerald
  "#fbbf24", // amber
  "#f472b6", // pink
  "#a78bfa", // violet
  "#fb7185", // rose
];

function buildTakeaway(rows: PaddingRow[]): string {
  if (rows.length === 0) return "";

  // Find most-flown carrier/route
  const top = rows.reduce((best, r) => (r.flights > best.flights ? r : best), rows[0]);
  const years = [...new Set(rows.filter(r => r.carrier === top.carrier).map(r => r.yr))].sort();
  const firstYear = years[0];
  const lastYear = years[years.length - 1];

  if (firstYear === lastYear) {
    return `In ${firstYear}, ${top.carrier} scheduled an average of ${top.avg_sched_min} min on ${top.route} but flights typically took ${top.median_actual_min} min — ${top.padding_min > 0 ? `${top.padding_min} minutes of built-in cushion` : `${Math.abs(top.padding_min)} minutes under the scheduled time`}.`;
  }

  const firstRow = rows.find(r => r.carrier === top.carrier && r.yr === firstYear);
  const lastRow = rows.find(r => r.carrier === top.carrier && r.yr === lastYear);
  if (!firstRow || !lastRow) return "";

  const change = lastRow.padding_min - firstRow.padding_min;
  const direction = change > 0 ? "up" : "down";
  return `On ${top.route}, ${top.carrier} has built ${Math.abs(change)} min ${direction} in schedule cushion since ${firstYear} — from ${firstRow.padding_min} min of padding to ${lastRow.padding_min} min. The route is now scheduled ${lastRow.avg_sched_min} min but typically takes ${lastRow.median_actual_min} min.`;
}

function buildChartData(rows: PaddingRow[]) {
  const carriers = [...new Set(rows.map(r => r.carrier))].sort();
  const years = [...new Set(rows.map(r => r.yr))].sort();

  return years.map(yr => {
    const point: Record<string, number | string> = { yr };
    for (const c of carriers) {
      const row = rows.find(r => r.carrier === c && r.yr === yr);
      if (row) {
        point[`${c}_sched`] = row.avg_sched_min;
        point[`${c}_actual`] = row.median_actual_min;
      }
    }
    return point;
  });
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

  const carriers = rows ? [...new Set(rows.map(r => r.carrier))].sort() : [];
  const chartData = rows ? buildChartData(rows) : [];
  const takeaway = rows ? buildTakeaway(rows) : "";
  const multiYear = rows ? [...new Set(rows.map(r => r.yr))].length > 1 : false;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold mb-1">Schedule padding</h1>
        <p className="text-zinc-500 text-sm">
          Padding = average scheduled time minus median actual time. Airlines inflate schedules
          to boost on-time stats — rising padding with flat actual times means the same flight
          takes the same time, but now counts as &quot;on time.&quot;
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
        <p className="text-red-400 text-sm">
          Error: {error} — is the API running?{" "}
          <code className="text-zinc-500">uvicorn pipeline.api:app --reload</code>
        </p>
      )}

      {rows && rows.length === 0 && (
        <p className="text-zinc-500 text-sm">No results (need ≥50 operated flights).</p>
      )}

      {rows && rows.length > 0 && (
        <div className="space-y-8">
          {/* Takeaway sentence */}
          <p className="text-zinc-300 text-sm leading-relaxed border-l-2 border-zinc-700 pl-4">
            {takeaway}
          </p>

          {/* Line chart */}
          {carriers.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-600 uppercase tracking-wider">
                Average scheduled vs. median actual elapsed time (min){multiYear ? " by year" : ""}
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    dataKey="yr"
                    stroke="#52525b"
                    tick={{ fill: "#71717a", fontSize: 11 }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#52525b"
                    tick={{ fill: "#71717a", fontSize: 11 }}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip
                    contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: "#a1a1aa" }}
                    itemStyle={{ color: "#e4e4e7" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "#71717a", paddingTop: 8 }}
                    formatter={(value: string) => value.replace("_sched", " sched").replace("_actual", " actual")}
                  />
                  {carriers.map((c, i) => {
                    const color = CARRIER_COLORS[i % CARRIER_COLORS.length];
                    return [
                      <Line
                        key={`${c}_sched`}
                        type="monotone"
                        dataKey={`${c}_sched`}
                        stroke={color}
                        strokeDasharray="4 2"
                        strokeWidth={1.5}
                        dot={{ r: 3, fill: color }}
                        name={`${c}_sched`}
                        connectNulls
                      />,
                      <Line
                        key={`${c}_actual`}
                        type="monotone"
                        dataKey={`${c}_actual`}
                        stroke={color}
                        strokeWidth={2}
                        dot={{ r: 3, fill: color }}
                        name={`${c}_actual`}
                        connectNulls
                      />,
                    ];
                  })}
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-zinc-700">Dashed = scheduled avg · Solid = actual median · Gap between them = padding</p>
            </div>
          )}

          {/* Table */}
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
        </div>
      )}
    </div>
  );
}
