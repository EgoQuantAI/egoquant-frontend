"use client";

import type { WhatIfResult } from "@/lib/what-if";

// A what-if result under the advisor's reply: baseline vs scenario as natural frequencies, the scenario in plain
// words, how many simulated futures, and the Risk Engine's verdict. A blocked or invalid scenario shows the
// reason and no chances. Numbers come from the engine (the structured result), never parsed from the reply.

function frequency(n: number | null | undefined) {
  return typeof n === "number" ? `${n} in 100` : "–";
}

export function WhatIfCard({ result }: { result: WhatIfResult }) {
  const ok = result.status === "ok";
  const blocked = result.status === "blocked";
  return (
    <div className="mt-3 border-2 border-zinc-900 bg-white px-4 py-3 text-sm text-zinc-800" aria-label="What-if simulation">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">What-if simulation</p>
      {result.scenario_text && <p className="mb-2 text-xs text-zinc-500">Scenario: {result.scenario_text}</p>}
      {ok ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span>Now: <span className="font-heading text-2xl text-zinc-900">{frequency(result.baseline_goal_frequency)}</span></span>
            <span aria-hidden className="text-zinc-400">→</span>
            <span>Scenario: <span className="font-heading text-2xl text-zinc-900">{frequency(result.scenario_goal_frequency)}</span></span>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            Simulated futures reaching the goal. Simulated with {result.n_paths?.toLocaleString("en-US") ?? "–"} futures
            on past market data; not a forecast or a guarantee.
            {result.portfolio_changed ? " The portfolio was re-optimised for this scenario." : ""}
          </p>
          <p className="mt-1 text-xs font-semibold text-zinc-900">Risk Engine: approved</p>
        </>
      ) : (
        <>
          <p className={`text-xs font-semibold ${blocked ? "text-red-700" : "text-zinc-900"}`}>
            {blocked ? "Risk Engine: blocked" : result.status === "invalid" ? "Not run" : "Not available right now"}
          </p>
          {result.reason && <p className="mt-1 text-xs text-zinc-600">{result.reason}</p>}
          {blocked && (result.risk_engine?.reasons ?? []).slice(0, 3).map((r) => (
            <p key={r} className="mt-1 text-xs text-zinc-500">· {r}</p>
          ))}
        </>
      )}
    </div>
  );
}

export function PrivacyNote({ hidden }: { hidden: number }) {
  return (
    <p className="text-[11px] text-zinc-500" aria-live="polite">
      <span className="font-semibold text-zinc-700">Privacy:</span>{" "}
      {hidden === 0
        ? "account numbers, emails and phone numbers are hidden from the AI."
        : `${hidden} sensitive value${hidden === 1 ? "" : "s"} hidden from the AI this session.`}
    </p>
  );
}
