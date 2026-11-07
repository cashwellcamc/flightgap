import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-14 py-4">
      {/* Hero */}
      <div className="space-y-5 max-w-2xl">
        <p className="text-xs text-zinc-600 uppercase tracking-widest">Flight reliability from the passenger&apos;s side</p>
        <h1 className="text-2xl font-semibold tracking-tight leading-snug">
          Was your flight really on time?<br />
          Was your cancellation really weather?
        </h1>
        <p className="text-zinc-400 text-sm leading-relaxed">
          Airlines report their own disruption codes to the federal government.
          Those codes determine whether passengers are owed anything.
          flightgap pulls that same data and checks the codes against observable facts —
          then shows you the gap between what you were owed and what you got.
        </p>
      </div>

      {/* Three tools */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-zinc-800 rounded-lg overflow-hidden">
        <div className="bg-zinc-950 p-5 space-y-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Flight check</p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Look up any domestic flight. We check whether the disruption code is consistent
            with what other airlines reported at the same airports that day.
          </p>
          <Link href="/lookup" className="text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors">
            Check a flight →
          </Link>
        </div>
        <div className="bg-zinc-950 p-5 space-y-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Schedule padding</p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Airlines inflate scheduled times so delayed flights still count as &quot;on time.&quot;
            See how much cushion is built into any route — and whether it&apos;s been growing.
          </p>
          <Link href="/padding" className="text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors">
            Explore padding →
          </Link>
        </div>
        <div className="bg-zinc-950 p-5 space-y-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Compensation gap</p>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Federal data tracks flights, not passengers. These reports show what disrupted
            passengers were owed, what they received, and what it cost to get it.
          </p>
          <Link href="/reports" className="text-xs text-zinc-400 hover:text-zinc-200 underline transition-colors">
            See real cases →
          </Link>
        </div>
      </div>

      {/* Case study */}
      <div className="space-y-5 max-w-2xl">
        <p className="text-xs text-zinc-600 uppercase tracking-wider">A real example</p>
        <div className="space-y-4 text-sm text-zinc-400 leading-relaxed">
          <p>
            On May 1, 2024, United Airlines cancelled UA1546 from San Diego to Newark at the gate —
            no advance notice — and reported it as code{" "}
            <span className="text-zinc-200 font-medium">B: Weather</span>.
            Two other United flights to Newark were cancelled the same morning, also coded weather.
          </p>
          <p>
            Weather is classified as an extraordinary circumstance. That coding meant United had no
            obligation under its published customer service commitments: no meal voucher, no hotel,
            no rebooking on a competitor airline.
          </p>
          <p>
            According to the federal on-time data for that day,{" "}
            <span className="text-zinc-200 font-medium">
              no other airline cancelled a flight for weather at San Diego or Newark
            </span>.
            All three code-B cancellations were United. All three were bound for the same hub.
          </p>
          <p className="text-zinc-600">
            That does not prove the weather coding was wrong — weather can affect one carrier
            without grounding others. But it is inconsistent with the observed data, and the
            passenger received nothing.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href="/lookup?date=2024-05-01&carrier=UA&flight=1546"
            className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-900 rounded text-sm font-medium hover:bg-white transition-colors"
          >
            Check UA1546 →
          </Link>
          <Link
            href="/reports"
            className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-700 text-zinc-300 rounded text-sm font-medium hover:border-zinc-500 hover:text-zinc-100 transition-colors"
          >
            See the compensation report →
          </Link>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-3 gap-px bg-zinc-800 rounded-lg overflow-hidden text-sm max-w-2xl">
        <div className="bg-zinc-950 px-4 py-4 space-y-1">
          <p className="text-2xl font-semibold text-amber-400">0</p>
          <p className="text-zinc-600 text-xs">other-airline weather cancels at SAN or EWR, May 1 2024</p>
        </div>
        <div className="bg-zinc-950 px-4 py-4 space-y-1">
          <p className="text-2xl font-semibold text-zinc-100">$0</p>
          <p className="text-zinc-600 text-xs">compensation received by UA1546 passenger</p>
        </div>
        <div className="bg-zinc-950 px-4 py-4 space-y-1">
          <p className="text-2xl font-semibold text-red-400">46</p>
          <p className="text-zinc-600 text-xs">days to resolve a separate multi-carrier missed connection</p>
        </div>
      </div>

      {/* Data note */}
      <p className="text-xs text-zinc-700 max-w-2xl leading-relaxed">
        Source: BTS Reporting Carrier On-Time Performance data (federal, public domain).
        Covers US domestic and international flights operated by US carriers.
        BTS data is revised quarterly; counts may differ from earlier exports.
        Compensation estimates are based on published rules and carrier commitments and should be
        verified independently before use in a claim.
      </p>
    </div>
  );
}
