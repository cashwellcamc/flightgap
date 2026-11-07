"use client";

import { useState } from "react";

const API = "http://localhost:8000";

interface VerdictRule {
  text: string;
  positive: boolean | null;
}

interface Verdict {
  label: "Plausible" | "Questionable" | "Suspicious";
  rules: VerdictRule[];
}

interface FlightContext {
  carrier_flights: number;
  carrier_cancellations: number;
  carrier_cancellations_monthly_median: number;
  carrier_weather_cancellations: number;
  carrier_weather_cancellations_monthly_median: number;
  origin_weather_cancellations_all_airlines: number;
  dest_weather_cancellations_all_airlines: number;
  other_carrier_weather_cancellations_at_airports: number;
  times_ran_this_route_this_month: number;
}

interface Commitments {
  carrier: string;
  meal_voucher: boolean;
  hotel_overnight: boolean;
  ground_transport: boolean;
  rebook_other_airline: boolean;
  cash_or_miles: boolean;
  est_meal_value_usd: number | null;
  est_hotel_value_usd: number | null;
  source_url: string | null;
  verify_note: string | null;
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
  verdict: Verdict | null;
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

function isDisrupted(leg: Leg) {
  return leg.cancelled || (leg.arr_delay_min != null && leg.arr_delay_min >= 15);
}

function VerdictCard({ verdict, code, label }: { verdict: Verdict | null; code: string | null; label: string | null }) {
  const causeLine = code ? `${code} — ${label ?? "Unknown"}` : "—";

  const verdictColors = {
    Plausible: "border-emerald-700 bg-emerald-950/40",
    Questionable: "border-amber-700 bg-amber-950/40",
    Suspicious: "border-red-700 bg-red-950/40",
  };
  const verdictTextColors = {
    Plausible: "text-emerald-400",
    Questionable: "text-amber-400",
    Suspicious: "text-red-400",
  };

  const borderClass = verdict ? verdictColors[verdict.label] : "border-zinc-800 bg-zinc-900/30";
  const textClass = verdict ? verdictTextColors[verdict.label] : "text-zinc-400";

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${borderClass}`}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="text-zinc-400">
          Reported cause: <span className="text-zinc-200 font-medium">{causeLine}</span>
        </span>
        {verdict && (
          <span>
            Our check:{" "}
            <span className={`font-semibold ${textClass}`}>{verdict.label}</span>
          </span>
        )}
      </div>
      {verdict && (
        <ul className="space-y-1.5 text-xs text-zinc-400">
          {verdict.rules.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 mt-0.5">
                {r.positive === true ? (
                  <span className="text-emerald-500">✓</span>
                ) : r.positive === false ? (
                  <span className="text-red-400">✗</span>
                ) : (
                  <span className="text-zinc-500">·</span>
                )}
              </span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CostCard({ code, carrier, commitments }: { code: string | null; carrier: string; commitments: Commitments | null }) {
  const controllable = code === "A";
  const isExtraordinary = code === "B" || code === "C" || code === "D";
  const codeNames: Record<string, string> = {
    A: "Carrier (controllable)",
    B: "Weather — not controllable",
    C: "National Air System — not controllable",
    D: "Security — not controllable",
  };

  const items: { label: string; value: boolean | null; note: string }[] = commitments
    ? [
        { label: "Meal voucher (3-hr+ controllable delay)", value: commitments.meal_voucher, note: commitments.est_meal_value_usd ? `est. $${commitments.est_meal_value_usd}` : "" },
        { label: "Hotel for overnight cancellation/delay", value: commitments.hotel_overnight, note: commitments.est_hotel_value_usd ? `est. $${commitments.est_hotel_value_usd}` : "" },
        { label: "Ground transport to/from hotel", value: commitments.ground_transport, note: "" },
        { label: "Rebook on another airline at no cost", value: commitments.rebook_other_airline, note: "" },
        { label: "Cash or flight credit if hotel unavailable", value: commitments.cash_or_miles, note: "" },
      ]
    : [];

  return (
    <div className="border border-zinc-800 rounded-lg p-4 space-y-3">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">What this coding cost you</p>
      {isExtraordinary && (
        <p className="text-sm text-zinc-400">
          This cancellation is coded <span className="text-zinc-200 font-medium">{code} ({codeNames[code!]})</span>.{" "}
          DOT customer service commitments apply only to carrier-caused (code A) disruptions.
          With this coding, the carrier has no obligation under its published commitments to provide meals, hotel, or rebooking assistance.
        </p>
      )}
      {controllable && (
        <p className="text-sm text-zinc-400">
          Carrier-caused cancellations (code A) trigger {carrier}&apos;s published customer service commitments.
        </p>
      )}
      {commitments ? (
        <>
          <p className="text-xs text-zinc-500">
            {isExtraordinary
              ? `If this had been coded A — ${carrier} commits to:`
              : `${carrier} commits to:`}
          </p>
          <ul className="space-y-1.5 text-xs">
            {items.map((item, i) => (
              <li key={i} className="flex gap-2 items-start">
                <span className={`shrink-0 mt-0.5 ${item.value ? "text-emerald-500" : "text-zinc-600"}`}>
                  {item.value ? "✓" : "✗"}
                </span>
                <span className={item.value ? "text-zinc-300" : "text-zinc-600"}>
                  {item.label}
                  {item.note && <span className="text-zinc-500 ml-1">({item.note})</span>}
                </span>
              </li>
            ))}
          </ul>
          {commitments.source_url && (
            <p className="text-xs text-zinc-600">
              Source:{" "}
              <a href={commitments.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400 transition-colors">
                DOT Airline Customer Service Dashboard
              </a>
              {commitments.verify_note && <span> · Note: {commitments.verify_note.split(".")[0]}.</span>}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-zinc-600">No commitment data on file for {carrier}. Check the DOT Airline Customer Service Dashboard.</p>
      )}
    </div>
  );
}

function ContextRow({
  label,
  today,
  median,
  highlight,
}: {
  label: string;
  today: number | string;
  median?: number | null;
  highlight?: "red" | "amber" | "green";
}) {
  const valueClass =
    highlight === "red" ? "text-red-400" :
    highlight === "amber" ? "text-amber-400" :
    highlight === "green" ? "text-emerald-400" :
    "text-zinc-200";

  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className={`${valueClass} tabular-nums`}>
        {typeof today === "number" ? today.toLocaleString() : today}
        {median != null && (
          <span className="text-zinc-600 ml-2 text-xs font-normal">
            (typical this month: {median % 1 === 0 ? median : median.toFixed(1)})
          </span>
        )}
      </span>
    </div>
  );
}

function LegCard({ leg, commitments }: { leg: Leg; commitments: Commitments | null }) {
  const ctx = leg.context;
  const disrupted = isDisrupted(leg);

  return (
    <div className="border border-zinc-800 rounded-lg p-5 space-y-4">
      {/* Header */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-xl font-semibold">{leg.carrier}{leg.flight_number}</span>
        <span className="text-zinc-300">{leg.origin} → {leg.dest}</span>
        <span className="text-zinc-500 text-sm">{leg.date}</span>
        {leg.cancelled ? (
          <span className="text-xs bg-red-950 text-red-400 border border-red-800 rounded px-2 py-0.5">
            CANCELLED
          </span>
        ) : leg.arr_delay_min != null && leg.arr_delay_min >= 60 ? (
          <span className="text-xs bg-amber-950 text-amber-400 border border-amber-800 rounded px-2 py-0.5">
            {leg.arr_delay_min} MIN LATE
          </span>
        ) : null}
      </div>

      {/* Verdict card — cancelled or significantly delayed legs only */}
      {disrupted && (leg.cancelled ? (
        <VerdictCard verdict={leg.verdict} code={leg.cancellation_code} label={leg.cancellation_label} />
      ) : leg.arr_delay_min != null && leg.arr_delay_min >= 60 ? (
        <div className="border border-amber-800 bg-amber-950/30 rounded-lg p-4 text-sm text-amber-300">
          Arrival delay: <span className="font-semibold">{leg.arr_delay_min} min</span> — delay attribution breakdown not shown (only available in BTS delay-causes data).
        </div>
      ) : null)}

      {/* Flight basics */}
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">Scheduled dep</span>
          <span className="text-zinc-200">{fmtTime(leg.sched_dep)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">Scheduled time</span>
          <span className="text-zinc-200">{leg.sched_elapsed_min != null ? `${leg.sched_elapsed_min} min` : "—"}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-zinc-500">Tail number</span>
          <span className={leg.tail_number ? "text-zinc-200" : "text-zinc-600"}>{leg.tail_number ?? "(none assigned)"}</span>
        </div>
        {!leg.cancelled && (
          <div className="flex justify-between gap-4">
            <span className="text-zinc-500">Arrival delay</span>
            <span className={
              leg.arr_delay_min != null && leg.arr_delay_min >= 60 ? "text-red-400" :
              leg.arr_delay_min != null && leg.arr_delay_min < 0 ? "text-emerald-400" :
              "text-zinc-200"
            }>
              {leg.arr_delay_min != null ? `${leg.arr_delay_min} min` : "—"}
            </span>
          </div>
        )}
      </div>

      {/* Context */}
      <div className="border-t border-zinc-800 pt-4 space-y-1.5">
        <p className="text-zinc-600 text-xs uppercase tracking-wider mb-3">Context — {leg.date}</p>
        <ContextRow label={`${leg.carrier} flights nationwide`} today={ctx.carrier_flights} />
        <ContextRow
          label={`${leg.carrier} cancellations nationwide`}
          today={ctx.carrier_cancellations}
          median={ctx.carrier_cancellations_monthly_median}
        />
        <ContextRow
          label={`${leg.carrier} weather cancellations nationwide`}
          today={ctx.carrier_weather_cancellations}
          median={ctx.carrier_weather_cancellations_monthly_median}
          highlight={ctx.carrier_weather_cancellations === 0 ? undefined : ctx.other_carrier_weather_cancellations_at_airports === 0 ? "amber" : undefined}
        />
        <ContextRow
          label={`Other-airline weather cancels at ${leg.origin} or ${leg.dest}`}
          today={ctx.other_carrier_weather_cancellations_at_airports}
          highlight={ctx.other_carrier_weather_cancellations_at_airports === 0 ? "amber" : "green"}
        />
        <ContextRow label={`Weather cancels touching ${leg.origin} (all airlines)`} today={ctx.origin_weather_cancellations_all_airlines} />
        <ContextRow label={`Weather cancels touching ${leg.dest} (all airlines)`} today={ctx.dest_weather_cancellations_all_airlines} />
        <ContextRow label="Times this route ran this month" today={ctx.times_ran_this_route_this_month} />
        <p className="text-zinc-700 text-xs pt-1">
          BTS on-time data is revised quarterly — counts may differ from earlier exports.
        </p>
      </div>

      {/* Cost section — only for cancelled legs */}
      {leg.cancelled && (
        <CostCard code={leg.cancellation_code} carrier={leg.carrier} commitments={commitments} />
      )}
    </div>
  );
}

function NormalLegRow({ leg }: { leg: Leg }) {
  return (
    <div className="flex items-center justify-between py-2 px-4 text-sm text-zinc-500 border-b border-zinc-900 last:border-0">
      <span>{leg.origin} → {leg.dest}  {fmtTime(leg.sched_dep)}</span>
      <span className={leg.arr_delay_min != null && leg.arr_delay_min < 0 ? "text-emerald-600" : ""}>
        {leg.arr_delay_min != null ? `${leg.arr_delay_min > 0 ? "+" : ""}${leg.arr_delay_min} min` : "on time"}
      </span>
    </div>
  );
}

export default function LookupPage() {
  const [date, setDate] = useState("2024-05-01");
  const [carrier, setCarrier] = useState("UA");
  const [flightNum, setFlightNum] = useState("1546");
  const [originFilter, setOriginFilter] = useState("");
  const [destFilter, setDestFilter] = useState("");
  const [result, setResult] = useState<FlightResult | null>(null);
  const [commitments, setCommitments] = useState<Commitments | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNormal, setShowNormal] = useState(false);

  async function lookup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setCommitments(null);
    setShowNormal(false);
    try {
      let url = `${API}/api/flight?date=${date}&carrier=${carrier.toUpperCase()}&flight=${flightNum}`;
      if (originFilter.trim()) url += `&origin=${originFilter.trim().toUpperCase()}`;
      if (destFilter.trim()) url += `&dest=${destFilter.trim().toUpperCase()}`;

      const [flightRes, commitRes] = await Promise.all([
        fetch(url),
        fetch(`${API}/api/commitments/${carrier.toUpperCase()}`),
      ]);
      if (!flightRes.ok) throw new Error(`API error ${flightRes.status}`);
      const flightData = await flightRes.json();
      setResult(flightData);
      if (commitRes.ok) {
        const c = await commitRes.json();
        setCommitments(c);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }

  const disrupted = result?.legs.filter(isDisrupted) ?? [];
  const normal = result?.legs.filter((l) => !isDisrupted(l)) ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-semibold mb-1">Flight lookup</h1>
        <p className="text-zinc-500 text-sm">
          Look up a flight and check whether the disruption coding is consistent with observed data.
        </p>
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
            value={flightNum}
            onChange={(e) => setFlightNum(e.target.value)}
            placeholder="1546"
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 w-28 focus:outline-none focus:border-zinc-500"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Origin <span className="text-zinc-700">(optional)</span>
          <input
            type="text"
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value.toUpperCase())}
            placeholder="SAN"
            maxLength={3}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 w-20 focus:outline-none focus:border-zinc-500 uppercase"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Dest <span className="text-zinc-700">(optional)</span>
          <input
            type="text"
            value={destFilter}
            onChange={(e) => setDestFilter(e.target.value.toUpperCase())}
            placeholder="EWR"
            maxLength={3}
            className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 w-20 focus:outline-none focus:border-zinc-500 uppercase"
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
        <p className="text-red-400 text-sm">
          Error: {error} — is the API running?{" "}
          <code className="text-zinc-500">uvicorn pipeline.api:app --reload</code>
        </p>
      )}

      {result && !result.found && (
        <div className="text-zinc-500 text-sm space-y-1">
          <p>Not found in federal data.</p>
          <p className="text-zinc-600">
            Possible reasons: foreign airline, international flight, operated by a regional partner, or month not downloaded yet.
          </p>
        </div>
      )}

      {result?.found && (
        <div className="space-y-4">
          {/* Disrupted legs first */}
          {disrupted.map((leg, i) => (
            <LegCard key={i} leg={leg} commitments={commitments} />
          ))}

          {/* Normal legs — collapsed */}
          {normal.length > 0 && (
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowNormal((s) => !s)}
                className="w-full flex items-center justify-between px-5 py-3 text-sm text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 transition-colors"
              >
                <span>{normal.length} leg{normal.length !== 1 ? "s" : ""} operated normally</span>
                <span>{showNormal ? "▲" : "▼"}</span>
              </button>
              {showNormal && normal.map((leg, i) => <NormalLegRow key={i} leg={leg} />)}
            </div>
          )}

          {disrupted.length === 0 && normal.length > 0 && (
            <p className="text-zinc-500 text-sm">All legs operated normally.</p>
          )}
        </div>
      )}
    </div>
  );
}
