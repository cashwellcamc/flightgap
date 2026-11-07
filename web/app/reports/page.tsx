"use client";

import { useState, useEffect } from "react";

const API = "http://localhost:8000";

interface CompensationItem {
  item_seq: number;
  carrier: string | null;
  item_type: string;
  description: string;
  face_value_usd: number | null;
  cash_equiv_usd: number | null;
  offered: boolean;
  received: boolean;
  restrictions: string | null;
  owed_basis: string | null;
  is_owed_estimate: boolean;
}

interface Leg {
  leg_seq: number;
  leg_type: "planned" | "actual";
  carrier: string | null;
  flight_number: string | null;
  origin: string | null;
  dest: string | null;
  disruption: string | null;
  jurisdiction: string | null;
  notes: string | null;
}

interface Report {
  report_id: string;
  title: string;
  flight_date: string;
  carrier: string;
  flight_number: string | null;
  origin: string;
  dest: string;
  disruption: string;
  reason_given: string | null;
  notice_hours: number | null;
  planned_legs: number;
  actual_legs: number | null;
  final_arrival_delay_h: number | null;
  offered: string | null;
  received_value_usd: number;
  days_to_resolve: number;
  complaints_filed: number;
  escalations: number;
  carriers_involved: string[];
  multi_carrier: boolean;
  owed_usd: number;
  received_usd: number;
  gap_usd: number;
  legs?: Leg[];
  compensation_items?: CompensationItem[];
  liability_gap_note?: string | null;
}

const DISRUPTION_LABELS: Record<string, string> = {
  cancellation: "Cancelled",
  delay: "Significant delay",
  missed_connection: "Missed connection",
  diversion: "Diverted",
};

const JURISDICTION_LABELS: Record<string, string> = {
  US_DOT: "US DOT",
  EU261: "EU261",
  UK261: "UK261",
  APPR: "Canada APPR",
  NONE: "No mandatory compensation law",
};

function fmt$(n: number | null, label = "") {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0 })}${label}`;
}

function GapBar({ owed, received }: { owed: number; received: number }) {
  const max = Math.max(owed, received, 1);
  const owedPct = (owed / max) * 100;
  const recPct = (received / max) * 100;
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex gap-2 items-center">
        <span className="text-zinc-500 w-20 shrink-0">Owed (est.)</span>
        <div className="flex-1 bg-zinc-800 rounded h-3 overflow-hidden">
          <div className="bg-amber-500/60 h-full rounded" style={{ width: `${owedPct}%` }} />
        </div>
        <span className="text-amber-400 w-14 text-right">{fmt$(owed)}</span>
      </div>
      <div className="flex gap-2 items-center">
        <span className="text-zinc-500 w-20 shrink-0">Received</span>
        <div className="flex-1 bg-zinc-800 rounded h-3 overflow-hidden">
          <div className="bg-emerald-500/60 h-full rounded" style={{ width: `${recPct}%` }} />
        </div>
        <span className="text-emerald-400 w-14 text-right">{fmt$(received)}</span>
      </div>
    </div>
  );
}

function HassleScore({ days, escalations }: { days: number; escalations: number }) {
  if (days === 0 && escalations === 0) {
    return <span className="text-zinc-500">Resolved same day (nothing paid out)</span>;
  }
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} day${days !== 1 ? "s" : ""} to resolve`);
  if (escalations > 0) parts.push(`${escalations} escalation${escalations !== 1 ? "s" : ""}`);
  return (
    <span className={days > 20 || escalations >= 3 ? "text-red-400" : days > 7 ? "text-amber-400" : "text-zinc-300"}>
      {parts.join(" · ")}
    </span>
  );
}

function ReportCard({ report, expanded, onToggle }: {
  report: Report;
  expanded: boolean;
  onToggle: () => void;
}) {
  const disruptionLabel = DISRUPTION_LABELS[report.disruption] ?? report.disruption;
  const hasGap = report.gap_usd > 0;

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full text-left px-5 py-4 hover:bg-zinc-900/40 transition-colors"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-zinc-100">{report.carrier}{report.flight_number ? report.flight_number : ""}</span>
              <span className="text-zinc-400">{report.origin} → {report.dest}</span>
              <span className="text-zinc-600">{report.flight_date}</span>
              <span className={`text-xs rounded px-2 py-0.5 border ${
                report.disruption === "cancellation"
                  ? "bg-red-950 text-red-400 border-red-800"
                  : report.disruption === "missed_connection"
                  ? "bg-amber-950 text-amber-400 border-amber-800"
                  : "bg-zinc-900 text-zinc-400 border-zinc-700"
              }`}>
                {disruptionLabel}
              </span>
              {report.multi_carrier && (
                <span className="text-xs rounded px-2 py-0.5 border bg-blue-950 text-blue-400 border-blue-800">
                  multi-carrier
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500">{report.reason_given}</p>
          </div>
          <div className="text-right space-y-0.5 shrink-0">
            {hasGap ? (
              <p className="text-sm font-semibold text-red-400">{fmt$(report.gap_usd)} gap</p>
            ) : (
              <p className="text-sm text-zinc-500">gap: {fmt$(report.gap_usd)}</p>
            )}
            <p className="text-xs text-zinc-600">{expanded ? "▲ collapse" : "▼ details"}</p>
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-zinc-800 px-5 py-5 space-y-6">
          {/* Gap bar */}
          <div className="space-y-2">
            <p className="text-xs text-zinc-600 uppercase tracking-wider">Compensation gap (estimated)</p>
            <GapBar owed={report.owed_usd} received={report.received_usd} />
            <p className="text-xs text-zinc-700">
              Owed figures are estimates based on applicable rules and carrier commitments.
              All figures in USD. &quot;Received&quot; uses cash-equivalent value, discounted for restrictions and expiration.
            </p>
          </div>

          {/* Hassle */}
          <div className="space-y-1">
            <p className="text-xs text-zinc-600 uppercase tracking-wider">Hassle cost</p>
            <div className="text-sm space-y-1">
              <div className="flex gap-2">
                <span className="text-zinc-500 w-32 shrink-0">Time to resolve</span>
                <HassleScore days={report.days_to_resolve} escalations={report.escalations} />
              </div>
              {report.complaints_filed > 0 && (
                <div className="flex gap-2">
                  <span className="text-zinc-500 w-32 shrink-0">Formal complaints</span>
                  <span className="text-zinc-300">{report.complaints_filed}</span>
                </div>
              )}
            </div>
          </div>

          {/* What was offered */}
          {report.offered && (
            <div className="space-y-1">
              <p className="text-xs text-zinc-600 uppercase tracking-wider">What was offered</p>
              <p className="text-sm text-zinc-400 leading-relaxed">{report.offered}</p>
            </div>
          )}

          {/* Liability gap */}
          {report.liability_gap_note && (
            <div className="border border-blue-900 bg-blue-950/30 rounded-lg p-4 text-sm text-blue-300 space-y-1">
              <p className="font-medium text-xs uppercase tracking-wider text-blue-500">Liability gap</p>
              <p>{report.liability_gap_note}</p>
            </div>
          )}

          {/* Compensation items */}
          {report.compensation_items && report.compensation_items.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-600 uppercase tracking-wider">Compensation breakdown</p>
              <div className="space-y-2">
                {report.compensation_items.filter(i => !i.is_owed_estimate).map((item, idx) => (
                  <div key={idx} className="flex gap-3 text-sm">
                    <span className={`shrink-0 mt-0.5 ${item.received ? "text-emerald-500" : "text-zinc-600"}`}>
                      {item.received ? "✓" : "·"}
                    </span>
                    <div className="space-y-0.5 flex-1 min-w-0">
                      <p className={item.received ? "text-zinc-300" : "text-zinc-500"}>{item.description}</p>
                      {item.restrictions && (
                        <p className="text-xs text-amber-600">{item.restrictions}</p>
                      )}
                      {item.face_value_usd != null && item.cash_equiv_usd != null && item.face_value_usd !== item.cash_equiv_usd && (
                        <p className="text-xs text-zinc-600">
                          Face {fmt$(item.face_value_usd)} · cash equivalent {fmt$(item.cash_equiv_usd)}
                        </p>
                      )}
                    </div>
                    {item.cash_equiv_usd != null && item.cash_equiv_usd > 0 && (
                      <span className="text-emerald-600 text-xs shrink-0 mt-0.5">{fmt$(item.cash_equiv_usd)}</span>
                    )}
                  </div>
                ))}
              </div>

              {report.compensation_items.some(i => i.is_owed_estimate) && (
                <div className="border-t border-zinc-800 pt-3 space-y-2">
                  <p className="text-xs text-zinc-600">Estimated owed (based on rules and carrier commitments):</p>
                  {report.compensation_items.filter(i => i.is_owed_estimate).map((item, idx) => (
                    <div key={idx} className="flex gap-3 text-sm">
                      <span className="shrink-0 mt-0.5 text-amber-600">→</span>
                      <div className="space-y-0.5 flex-1 min-w-0">
                        <p className="text-zinc-400">{item.description}</p>
                        {item.owed_basis && (
                          <p className="text-xs text-zinc-600 leading-relaxed">{item.owed_basis}</p>
                        )}
                      </div>
                      {item.cash_equiv_usd != null && (
                        <span className="text-amber-500 text-xs shrink-0 mt-0.5">{fmt$(item.cash_equiv_usd)} est.</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Legs */}
          {report.legs && report.legs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-zinc-600 uppercase tracking-wider">Itinerary</p>
              {(["planned", "actual"] as const).map(type => {
                const legs = report.legs!.filter(l => l.leg_type === type);
                if (legs.length === 0) return null;
                return (
                  <div key={type}>
                    <p className="text-xs text-zinc-700 mb-1 capitalize">{type}:</p>
                    <div className="space-y-1">
                      {legs.map((leg, i) => (
                        <div key={i} className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                          <span className="text-zinc-400">
                            {leg.carrier}{leg.flight_number ? ` ${leg.flight_number}` : ""}{" "}
                            {leg.origin ?? "?"}→{leg.dest ?? "?"}
                          </span>
                          {leg.jurisdiction && leg.jurisdiction !== "NONE" && (
                            <span className="text-zinc-700">{JURISDICTION_LABELS[leg.jurisdiction] ?? leg.jurisdiction}</span>
                          )}
                          {leg.disruption && (
                            <span className="text-red-600">{leg.disruption.replace("_", " ")}</span>
                          )}
                          {leg.notes && <span className="text-zinc-700 w-full">{leg.notes}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SubmitForm({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    flight_date: "", carrier: "", flight_number: "", origin: "", dest: "",
    disruption: "cancellation", reason_given: "", notice_hours: "",
    planned_legs: "1", offered: "", received_value_usd: "0",
    days_to_resolve: "0", complaints_filed: "0", escalations: "0",
  });

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          notice_hours: form.notice_hours ? parseFloat(form.notice_hours) : null,
          planned_legs: parseInt(form.planned_legs),
          received_value_usd: parseFloat(form.received_value_usd) || 0,
          days_to_resolve: parseInt(form.days_to_resolve) || 0,
          complaints_filed: parseInt(form.complaints_filed) || 0,
          escalations: parseInt(form.escalations) || 0,
        }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setOpen(false);
      setForm({ flight_date: "", carrier: "", flight_number: "", origin: "", dest: "",
        disruption: "cancellation", reason_given: "", notice_hours: "",
        planned_legs: "1", offered: "", received_value_usd: "0",
        days_to_resolve: "0", complaints_filed: "0", escalations: "0" });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 w-full";
  const labelCls = "flex flex-col gap-1 text-xs text-zinc-500";

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-5 py-2.5 border border-zinc-700 text-zinc-300 rounded text-sm font-medium hover:border-zinc-500 hover:text-zinc-100 transition-colors"
      >
        + Report your disruption
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="border border-zinc-700 rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Report a disruption</p>
        <button type="button" onClick={() => setOpen(false)} className="text-zinc-600 hover:text-zinc-400 text-sm">cancel</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className={labelCls}>
          Date <input type="date" value={form.flight_date} onChange={e => set("flight_date", e.target.value)} className={inputCls} required />
        </label>
        <label className={labelCls}>
          Carrier <input type="text" value={form.carrier} onChange={e => set("carrier", e.target.value.toUpperCase())} placeholder="UA" maxLength={3} className={inputCls} required />
        </label>
        <label className={labelCls}>
          Flight # <input type="text" value={form.flight_number} onChange={e => set("flight_number", e.target.value)} placeholder="1546" className={inputCls} />
        </label>
        <label className={labelCls}>
          Type
          <select value={form.disruption} onChange={e => set("disruption", e.target.value)} className={inputCls}>
            <option value="cancellation">Cancellation</option>
            <option value="delay">Delay</option>
            <option value="missed_connection">Missed connection</option>
            <option value="diversion">Diversion</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>
          Origin <input type="text" value={form.origin} onChange={e => set("origin", e.target.value.toUpperCase())} placeholder="SAN" maxLength={3} className={inputCls} required />
        </label>
        <label className={labelCls}>
          Dest <input type="text" value={form.dest} onChange={e => set("dest", e.target.value.toUpperCase())} placeholder="EWR" maxLength={3} className={inputCls} required />
        </label>
      </div>

      <label className={labelCls}>
        Reason given by carrier
        <input type="text" value={form.reason_given} onChange={e => set("reason_given", e.target.value)} placeholder="e.g. Weather, Mechanical issue" className={inputCls} />
      </label>

      <label className={labelCls}>
        Notice received (hours before scheduled departure; 0 = at the gate)
        <input type="number" value={form.notice_hours} onChange={e => set("notice_hours", e.target.value)} placeholder="0" step="0.5" className={inputCls} />
      </label>

      <label className={labelCls}>
        What was offered or given
        <textarea value={form.offered} onChange={e => set("offered", e.target.value)} rows={2} placeholder="e.g. Meal voucher $15, hotel, rebooked on next flight" className={`${inputCls} resize-none`} />
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <label className={labelCls}>
          Received (cash equiv. $USD)
          <input type="number" value={form.received_value_usd} onChange={e => set("received_value_usd", e.target.value)} step="1" className={inputCls} />
        </label>
        <label className={labelCls}>
          Days to resolve
          <input type="number" value={form.days_to_resolve} onChange={e => set("days_to_resolve", e.target.value)} min="0" className={inputCls} />
        </label>
        <label className={labelCls}>
          Formal complaints
          <input type="number" value={form.complaints_filed} onChange={e => set("complaints_filed", e.target.value)} min="0" className={inputCls} />
        </label>
        <label className={labelCls}>
          Escalations
          <input type="number" value={form.escalations} onChange={e => set("escalations", e.target.value)} min="0" className={inputCls} />
        </label>
      </div>

      <p className="text-xs text-zinc-700">
        &ldquo;Received&rdquo; should be your best estimate of cash-equivalent value —
        discount travel credits for restrictions and expiration dates.
        All figures are estimates and are labeled as such.
      </p>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button type="submit" disabled={loading} className="px-5 py-2 bg-zinc-100 text-zinc-900 rounded text-sm font-medium hover:bg-white disabled:opacity-50 transition-colors">
        {loading ? "submitting…" : "Submit report"}
      </button>
    </form>
  );
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/reports`);
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const list: Report[] = await res.json();
      // Fetch full detail for each (legs + items)
      const full = await Promise.all(
        list.map(r => fetch(`${API}/api/reports/${r.report_id}`).then(x => x.json()))
      );
      setReports(full);
      if (full.length > 0 && !expanded) setExpanded(full[0].report_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-8">
      <div className="space-y-2 max-w-2xl">
        <h1 className="text-lg font-semibold">Compensation gap</h1>
        <p className="text-zinc-500 text-sm leading-relaxed">
          BTS on-time data records flights, not passengers. It shows how airlines code disruptions —
          not what passengers were owed or what it cost to get it.
          These reports fill the gap: planned vs. actual itinerary, what each carrier was obligated to provide
          under applicable rules, what was actually received, and how long it took.
        </p>
        <p className="text-zinc-600 text-xs">
          Owed figures are estimates based on published rules and carrier commitments and should be verified independently.
          Cash-equivalent values discount credits and vouchers that carry restrictions or expiration dates.
        </p>
      </div>

      <SubmitForm onSuccess={load} />

      {error && (
        <p className="text-red-400 text-sm">
          Error: {error} — is the API running?{" "}
          <code className="text-zinc-500">uvicorn pipeline.api:app --reload</code>
        </p>
      )}

      {loading && <p className="text-zinc-600 text-sm">Loading reports…</p>}

      {reports && reports.length > 0 && (
        <div className="space-y-4">
          {reports.map(r => (
            <ReportCard
              key={r.report_id}
              report={r}
              expanded={expanded === r.report_id}
              onToggle={() => setExpanded(expanded === r.report_id ? null : r.report_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
