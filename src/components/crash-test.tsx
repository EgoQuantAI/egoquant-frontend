"use client";

import { useState } from "react";
import type { CrashTest as CrashTestResult } from "@/lib/egoquant";

// The Risk Game's last step. The player holds 10,000 in a balanced fund through a fixed, hypothetical
// fall and recovery, one month at a time, and may hold, sell half or sell all at every step. It is a stand-in
// for panic-selling evidence when there is no trading history (Agent B reads it; it can only make the limits
// more careful). Drawdowns are measured from the running peak and sent as fractions, never percents.

/** Index of a balanced fund over 13 monthly steps (peak 104, trough 67.6 = 35% below the peak). */
export const CRASH_PATH = [100, 104, 98, 93, 96, 88, 81, 74, 67.6, 72, 80, 87, 93];
export const CRASH_START = 10_000;

const round4 = (x: number) => Math.round(x * 10_000) / 10_000;
const money = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Loss from the highest point reached so far, as a fraction (0 at a new high). */
function drawdownAt(step: number): number {
  const peak = Math.max(...CRASH_PATH.slice(0, step + 1));
  return (peak - CRASH_PATH[step]) / peak;
}

const primary =
  "border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900";
const secondary =
  "border-2 border-zinc-900 bg-white px-8 py-3 text-sm font-semibold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white";

function PathChart({ upTo }: { upTo: number }) {
  const w = 560, h = 200, pad = 12;
  const lo = 60, hi = 110;
  const x = (i: number) => pad + (i / (CRASH_PATH.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - lo) / (hi - lo)) * (h - 2 * pad);
  const points = CRASH_PATH.slice(0, upTo + 1).map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const peak = Math.max(...CRASH_PATH.slice(0, upTo + 1));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-xl border border-zinc-200" role="img"
         aria-label={`Fund value over ${upTo} months of a hypothetical market path`}>
      <line x1={pad} x2={w - pad} y1={y(peak)} y2={y(peak)} stroke="#a1a1aa" strokeDasharray="4 4" />
      <text x={w - pad} y={y(peak) - 4} textAnchor="end" fontSize={10} fill="#a1a1aa">highest so far</text>
      <polyline points={points} fill="none" stroke="#18181b" strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={x(upTo)} cy={y(CRASH_PATH[upTo])} r={4.5} fill="#18181b" />
    </svg>
  );
}

export function CrashTest({ onDone }: { onDone: (result: CrashTestResult) => void }) {
  const [step, setStep] = useState(0);            // 0 = the start; 1-12 = the months the player decides in
  const [held, setHeld] = useState(1);            // share of the original fund still held
  const [cash, setCash] = useState(0);            // proceeds of what was sold (no interest, no costs)
  const [soldAt, setSoldAt] = useState<number | null>(null);

  const price = CRASH_PATH[step];
  const dd = drawdownAt(step);
  const value = CRASH_START * held * (price / 100) + cash;
  const maxSeen = Math.max(...CRASH_PATH.map((_, i) => (i <= step ? drawdownAt(i) : 0)));
  const last = CRASH_PATH.length - 1;

  function decide(sell: "none" | "half" | "all") {
    const sold = sell === "all" ? held : sell === "half" ? held / 2 : 0;
    const nextHeld = held - sold;
    const firstSale = soldAt === null && sold > 0 ? dd : soldAt;
    if (sell === "all" || step === last) {
      onDone({
        sold_at_drawdown: firstSale === null ? null : round4(firstSale),
        sold_fraction: round4(1 - nextHeld),
        max_drawdown_seen: round4(maxSeen),
      });
      return;
    }
    setHeld(nextHeld);
    setCash(cash + CRASH_START * sold * (price / 100));
    setSoldAt(firstSale);
    setStep(step + 1);
  }

  if (step === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center px-12 py-8">
        <p className="eq-rise font-heading text-5xl leading-[1.1] text-zinc-900">Crash<br />Test.</p>
        <div className="eq-rule my-8 h-px bg-zinc-300" />
        <p className="max-w-xl text-base leading-relaxed text-zinc-600">
          Imagine you hold {money(CRASH_START)} in a balanced fund. We will walk through twelve months of a
          market fall and recovery, one month at a time. At each month you can hold, sell half of what you
          still have, or sell all. There is no right answer: we want to see what you would do.
        </p>
        <p className="mt-4 max-w-xl text-sm font-semibold text-zinc-900">
          Hypothetical market path, not a forecast. No real money is involved.
        </p>
        <button type="button" onClick={() => setStep(1)} className={`mt-10 self-start ${primary}`}>
          Begin <span className="eq-arrow">→</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center px-12 py-8">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Your holdings now</p>
          <p className="font-heading text-5xl leading-none text-zinc-900">{money(value)}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {pct(held)} still in the fund
            {held < 1 && ` · ${money(cash)} in cash`}
          </p>
        </div>
        <div className="text-right">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            Month {step} of {last}
          </p>
          <p className="font-heading text-3xl leading-none text-zinc-900">
            {dd === 0 ? "At its high" : `${pct(dd)} below its high`}
          </p>
          <p className="mt-1 text-sm text-zinc-400">fund value, measured from its highest point so far</p>
        </div>
      </div>

      <PathChart upTo={step} />
      <p className="mt-2 text-xs text-zinc-400">Hypothetical market path, not a forecast.</p>

      <p className="mb-4 mt-6 text-sm text-zinc-500">What do you do this month?</p>
      <div className="flex gap-4">
        <button type="button" onClick={() => decide("none")} className={primary}>Hold</button>
        <button type="button" onClick={() => decide("half")} className={secondary}>Sell half</button>
        <button type="button" onClick={() => decide("all")} className={secondary}>Sell all</button>
      </div>
    </div>
  );
}
