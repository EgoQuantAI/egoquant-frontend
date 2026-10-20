"use client";

import { FanChart } from "@/components/fan-chart";
import { Paged } from "@/components/paged";
import { type GoalReport, type GoalResult, pct } from "@/lib/egoquant";

// The goal result, in three parts for the portfolio page's section tabs:
//   Goal     the chance as a natural frequency with a 100-icon array, where you could end up (labelled by
//            how often it happens, never "pessimistic / optimistic"), and how bad a miss could be, in money;
//   Outlook  the wealth fan over the years and what would change the odds (one input at a time);
//   Method   how the chance was calculated, how the portfolio was chosen, and the shortlist.
// Every number and sentence comes from the backend (report.py build_goal_report); this file only lays it out.
// Frequencies and icon arrays are understood better than percentages (Spiegelhalter et al., Science 2011).

function money(x: number) {
  return `$${Math.round(x).toLocaleString("en-US")}`;
}

/** 100 squares: the futures that reach the goal filled, the rest outlined. */
function IconArray({ filled }: { filled: number }) {
  return (
    <div role="img" aria-label={`${filled} of 100 simulated futures reach the goal`}
         className="grid w-full max-w-[360px] gap-[3px]" style={{ gridTemplateColumns: "repeat(20, minmax(0, 1fr))" }}>
      {Array.from({ length: 100 }, (_, i) => (
        <span key={i} className={`aspect-square ${i < filled ? "bg-zinc-900" : "border border-zinc-300 bg-white"}`} />
      ))}
    </div>
  );
}

export function GoalOutcome({ goal }: { goal: GoalReport }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-5 grid shrink-0 grid-cols-[auto_1fr] items-center gap-8">
        <div className="border-2 border-zinc-900 px-5 py-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Chance of Reaching It</p>
          <p className="font-heading text-5xl leading-none text-zinc-900">{goal.chance}</p>
          <p className="mt-2 text-xs text-zinc-400">{money(goal.goal_amount)} in {goal.horizon_years} years</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <IconArray filled={goal.in_100} />
          <div className="flex flex-wrap gap-x-5 text-xs text-zinc-500">
            <span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 bg-zinc-900" /> Reach the goal ({goal.in_100})</span>
            <span className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 border border-zinc-300" /> Fall short ({100 - goal.in_100})</span>
          </div>
        </div>
      </div>

      <p className="mb-5 shrink-0 border-l-4 border-zinc-900 pl-4 text-sm leading-relaxed text-zinc-900">{goal.headline}</p>

      <p className="mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Where Your Portfolio Could End Up</p>
      <p className="mb-3 shrink-0 text-xs leading-relaxed text-zinc-500">
        Each box is one possible value of this portfolio after {goal.horizon_years} years, out of the simulated futures:
        a weak one, the typical one and a strong one. Its label says how often a future ends there. Hover a box for the details.
      </p>
      <div className="mb-5 grid shrink-0 grid-cols-3 gap-3">
        {goal.outcomes.map((row) => (
          <div key={row.label} className="border-2 border-zinc-200 p-4" title={row.text}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{row.label}</p>
            <p className="font-heading text-2xl leading-none text-zinc-900">{row.value}</p>
          </div>
        ))}
      </div>

      <p className="mb-2 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">How Bad Could a Miss Be?</p>
      <div className="flex min-h-0 flex-1 flex-col">
        <Paged
          items={goal.severity}
          itemKey={(row) => row.label}
          noun="notes"
          listClassName="flex flex-col gap-3"
          render={(row) => (
            <p className={`border-l-4 pl-4 text-sm leading-relaxed text-zinc-700 ${
              row.label === "Money runs out" && row.value !== "Never" ? "border-red-600" : "border-zinc-200"
            }`}>
              <span className="font-semibold text-zinc-900">{row.label}: {row.value}.</span> {row.text}
            </p>
          )}
        />
      </div>
      <p className="mt-3 shrink-0 text-xs leading-relaxed text-zinc-400">
        {goal.label} Not a guarantee; results vary with each use and over time. How it was calculated is under
        Method, the full notes under Data.
      </p>
    </div>
  );
}

export function GoalOutlook({ goal }: { goal: GoalReport }) {
  return (
    <div className="flex min-h-0 flex-1 gap-8">
      <div className="flex min-h-0 flex-[3] flex-col">
        <p className="mb-2 shrink-0 text-xs leading-relaxed text-zinc-500">{goal.plan}</p>
        <p className="mb-3 shrink-0 text-xs leading-relaxed text-zinc-500">
          How to read the chart: it follows your money year by year across thousands of simulated futures. The dark line
          is the middle one (half end above it, half below). The dark band holds the middle half of the futures, the light
          band 8 in 10 of them; the wider the bands, the less certain the result. Where the line and bands sit against the
          dashed goal line shows how likely you are to get there. Hover a year for the exact numbers.
        </p>
        <FanChart fan={goal.fan} goal={goal.goal_amount} />
        <p className="mt-3 shrink-0 text-xs leading-relaxed text-zinc-400">{goal.precision}</p>
      </div>
      <div className="flex min-h-0 min-w-0 flex-[2] flex-col">
        <p className="mb-1 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">What Would Change Your Odds</p>
        <p className="mb-3 shrink-0 text-xs leading-relaxed text-zinc-500">{goal.levers_intro}</p>
        <div className="grid shrink-0 grid-cols-[1fr_auto] gap-x-5 border-b-2 border-zinc-900 pb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          <span>Change</span><span className="text-right">Chance</span>
        </div>
        <div className="grid shrink-0 grid-cols-[1fr_auto] gap-x-5 border-b border-zinc-100 py-2 text-sm font-semibold text-zinc-900">
          <span>Your plan as it is</span><span className="text-right">{goal.chance}</span>
        </div>
        {goal.levers.length > 0 ? (
          <Paged
            items={goal.levers}
            itemKey={(lv, i) => `${i}-${lv.kind}`}
            noun="changes"
            listClassName="flex flex-col"
            render={(lv) => (
              <div className="grid grid-cols-[1fr_auto] gap-x-5 border-b border-zinc-100 py-2 text-sm text-zinc-700">
                <span>{lv.change}</span>
                <span className={`text-right ${lv.prob_goal > goal.prob_goal ? "font-semibold text-zinc-900" : ""}`}>{lv.chance}</span>
              </div>
            )}
          />
        ) : (
          <p className="mt-3 text-sm text-zinc-500">The plan already reaches the goal in almost every simulated future.</p>
        )}
      </div>
    </div>
  );
}

export function GoalMethod({ report, goal, chosenNote = "Best chance of reaching your goal" }: { report: GoalReport; goal: GoalResult; chosenNote?: string }) {
  const { screening } = goal;
  const notes = [
    ...report.method.map((s, i) => ({ title: `${i + 1}. ${s.title}`, text: s.text, strong: false })),
    ...report.choice.map((text, i) => ({ title: "", text, strong: i === report.choice.length - 1 })),
    ...screening.facts.map((text) => ({ title: "", text, strong: false })),
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-5 grid shrink-0 grid-cols-2 gap-4 md:grid-cols-4">
        <Step value={report.n_paths.toLocaleString("en-US")} label="Simulated futures" note={`From ${report.history_start.slice(0, 4)}–${report.history_end.slice(0, 4)} market history`} />
        <Step value={String(screening.counts.candidates ?? goal.n_candidates ?? 0)} label="Portfolios built" note="All inside your limits" />
        <Step value={String(screening.counts.approved ?? report.shortlist.length)} label="Shortlisted" note="Fit to how you take risk" />
        <Step value="1" label="Chosen" note={chosenNote} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-8 md:flex-row">
        <div className="flex min-h-80 flex-1 flex-col md:min-h-0">
          <Paged
            items={notes}
            itemKey={(n, i) => `${i}-${n.text.slice(0, 24)}`}
            noun="notes"
            listClassName="flex flex-col gap-3"
            render={(n) => (
              <p className={`border-l-4 pl-4 text-sm leading-relaxed ${
                n.title || n.strong ? "border-zinc-900 text-zinc-900" : "border-zinc-200 text-zinc-700"
              }`}>
                {n.title && <span className="font-semibold">{n.title}. </span>}{n.text}
              </p>
            )}
          />
        </div>
        <div className="flex min-h-80 flex-1 flex-col md:min-h-0">
          <div className="grid shrink-0 grid-cols-[1fr_repeat(3,auto)] gap-x-5 border-b-2 border-zinc-900 pb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            <span>Shortlisted</span><span className="text-right">Stocks</span>
            <span className="text-right">Half above</span><span className="text-right">Chance</span>
          </div>
          <Paged
            items={report.shortlist}
            itemKey={(row, i) => `${i}-${row.label}`}
            noun="portfolios"
            listClassName="flex flex-col"
            render={(row) => (
              <div className={`grid grid-cols-[1fr_repeat(3,auto)] gap-x-5 border-b border-zinc-100 py-2 text-sm ${
                row.chosen ? "font-semibold text-zinc-900" : "text-zinc-600"
              }`}>
                <span className="truncate">{row.chosen ? "▸ " : ""}{row.label.charAt(0).toUpperCase() + row.label.slice(1)}</span>
                <span className="text-right">{pct(row.equity_weight)}</span>
                <span className="text-right">{money(row.p50 >= 1000 ? Number(row.p50.toPrecision(3)) : row.p50)}</span>
                <span className="text-right">{chance(row.prob_goal)}</span>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  );
}

/** Same rounding as the backend's _chance: whole percent, never a misleading 0% or 100%. */
function chance(p: number) {
  if (p <= 0) return "0%";
  if (p >= 1) return "100%";
  if (p < 0.005) return "<1%";
  if (p > 0.995) return ">99%";
  return pct(p);
}

/** Where the simulated history comes from (shown under Data). */
export function GoalHistoryNotes({ goal }: { goal: GoalResult }) {
  const notes = [
    `${goal.n_paths.toLocaleString("en-US")} paths built by resampling one-month blocks of real daily returns from ` +
      `${goal.history_start} to ${goal.history_end}, after fund fees, rebalanced monthly.`,
    ...(goal.history_note ? [goal.history_note] : []),
    ...(goal.backfilled ?? []).map((b) =>
      `${b.ticker}: real prices from ${b.own_start}; ${b.filled_days.toLocaleString("en-US")} earlier days rebuilt from ` +
      `${b.factors.join(", ")} (they explain ${pct(b.r_squared)} of its daily moves; ${b.method}).`),
  ];
  return (
    <>
      <p className="mb-3 shrink-0 text-xs text-zinc-500">
        The goal simulation&apos;s price history.
        {goal.backfilled && goal.backfilled.length > 0 &&
          " A fund listed recently has no prices for the earlier years, so its missing days are rebuilt from the long-history funds it moves with."}
      </p>
      <Paged
        items={notes}
        itemKey={(n, i) => `${i}-${n.slice(0, 20)}`}
        noun="notes"
        render={(n) => <p className="border-l-4 border-zinc-200 pl-4 text-xs leading-relaxed text-zinc-600">{n}</p>}
      />
    </>
  );
}

function Step({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="border-l-4 border-zinc-900 px-5 py-2">
      <p className="font-heading text-4xl leading-none text-zinc-900">{value}</p>
      <p className="mt-1 text-sm font-semibold text-zinc-900">{label}</p>
      <p className="text-xs text-zinc-500">{note}</p>
    </div>
  );
}
