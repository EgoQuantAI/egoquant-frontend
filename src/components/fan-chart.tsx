"use client";

import { type MouseEvent, useState } from "react";
import { Paged } from "@/components/paged";
import type { FanPoint } from "@/lib/egoquant";

// Wealth fan for the chosen portfolio: the 10-90 and 25-75 percentile bands of the simulated paths,
// the median as a line, and the goal as a labelled reference line. One quantity, so one grey ramp
// (lighter = wider band). Hover shows every percentile for that year; the table view shows them all.
// The chart scales to the space it is given (never wider or taller), and the table pages, so neither scrolls.

const W = 640;
const H = 260;
const PAD = { top: 16, right: 16, bottom: 32, left: 64 };

function money(x: number) {
  if (Math.abs(x) >= 1_000_000) return `$${(x / 1_000_000).toFixed(1)}M`;
  if (Math.abs(x) >= 10_000) return `$${Math.round(x / 1000)}k`;
  return `$${Math.round(x).toLocaleString("en-US")}`;
}

function niceTicks(max: number, count = 4): number[] {
  const raw = max / count;
  const step = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * step).find((s) => s >= raw) ?? raw;
  return Array.from({ length: Math.floor(max / nice) + 1 }, (_, i) => i * nice);
}

export function FanChart({ fan, goal }: { fan: FanPoint[]; goal: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [tipX, setTipX] = useState(0);   // pointer position in the chart box, for the tooltip
  const [asTable, setAsTable] = useState(false);
  if (fan.length < 2) return null;

  const years = fan[fan.length - 1].year;
  const yMax = Math.max(goal, ...fan.map((p) => p.p90)) * 1.08;
  const x = (year: number) => PAD.left + (year / years) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / yMax) * (H - PAD.top - PAD.bottom);
  const band = (lo: keyof FanPoint, hi: keyof FanPoint) =>
    [...fan.map((p) => `${x(p.year)},${y(p[hi])}`), ...[...fan].reverse().map((p) => `${x(p.year)},${y(p[lo])}`)].join(" ");
  const median = fan.map((p, i) => `${i ? "L" : "M"}${x(p.year)},${y(p.p50)}`).join(" ");
  const ticks = niceTicks(yMax);
  const yearTicks = fan.filter((p, i) => fan.length <= 11 || i % Math.ceil(fan.length / 10) === 0 || i === fan.length - 1);
  const point = hover === null ? null : fan[hover];

  function onMove(event: MouseEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const frame = event.currentTarget.ownerSVGElement?.parentElement?.getBoundingClientRect();
    const year = ((event.clientX - box.left) / box.width) * years;
    if (frame) setTipX(Math.max(0, Math.min(event.clientX - frame.left + 12, frame.width - 140)));
    let best = 0;
    fan.forEach((p, i) => { if (Math.abs(p.year - year) < Math.abs(fan[best].year - year)) best = i; });
    setHover(best);
  }

  return (
    <figure className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="flex items-center gap-2"><span className="inline-block h-2.5 w-4 bg-zinc-200" /> 10–90% of outcomes</span>
          <span className="flex items-center gap-2"><span className="inline-block h-2.5 w-4 bg-zinc-400" /> 25–75%</span>
          <span className="flex items-center gap-2"><span className="inline-block h-0.5 w-4 bg-zinc-900" /> Median</span>
          <span className="flex items-center gap-2"><span className="inline-block w-4 border-t-2 border-dashed border-zinc-900" /> Goal</span>
        </div>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="underline hover:text-zinc-900">
          {asTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {asTable ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid shrink-0 grid-cols-6 border-b-2 border-zinc-900 pb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            <span>Year</span>
            {["10th", "25th", "Median", "75th", "90th"].map((h) => <span key={h} className="text-right">{h}</span>)}
          </div>
          <Paged
            items={fan}
            itemKey={(p) => String(p.year)}
            noun="years"
            listClassName="flex flex-col"
            render={(p) => (
              <div className="grid grid-cols-6 border-b border-zinc-100 py-1.5 text-sm text-zinc-700">
                <span>{p.year}</span>
                {[p.p10, p.p25, p.p50, p.p75, p.p90].map((v, i) => <span key={i} className="text-right">{money(v)}</span>)}
              </div>
            )}
          />
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMinYMin meet" role="img"
               aria-label={`Simulated wealth over ${years} years: median ${money(fan[fan.length - 1].p50)} at the end, goal ${money(goal)}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#f4f4f5" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-zinc-400 text-[10px]">{money(t)}</text>
              </g>
            ))}
            {yearTicks.map((p) => (
              <text key={p.year} x={x(p.year)} y={H - 10} textAnchor="middle" className="fill-zinc-400 text-[10px]">
                {p.year === 0 ? "Today" : `Yr ${p.year}`}
              </text>
            ))}
            <polygon points={band("p10", "p90")} fill="#e4e4e7" />
            <polygon points={band("p25", "p75")} fill="#a1a1aa" />
            <path d={median} fill="none" stroke="#18181b" strokeWidth={2} strokeLinejoin="round" />
            <line x1={PAD.left} x2={W - PAD.right} y1={y(goal)} y2={y(goal)} stroke="#18181b" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={W - PAD.right} y={y(goal) - 6} textAnchor="end" className="fill-zinc-900 text-[10px] font-semibold">Goal {money(goal)}</text>
            {point && (
              <g pointerEvents="none">
                <line x1={x(point.year)} x2={x(point.year)} y1={PAD.top} y2={H - PAD.bottom} stroke="#18181b" strokeWidth={1} />
                <circle cx={x(point.year)} cy={y(point.p50)} r={4} fill="#18181b" stroke="#ffffff" strokeWidth={2} />
              </g>
            )}
            <rect x={PAD.left} y={PAD.top} width={W - PAD.left - PAD.right} height={H - PAD.top - PAD.bottom}
                  fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
          </svg>
          {point && (
            <div className="pointer-events-none absolute top-2 border-2 border-zinc-900 bg-white px-3 py-2 text-xs text-zinc-700"
                 style={{ left: tipX }}>
              <p className="mb-1 font-semibold text-zinc-900">{point.year === 0 ? "Today" : `Year ${point.year}`}</p>
              <p>90th: {money(point.p90)}</p>
              <p>75th: {money(point.p75)}</p>
              <p className="font-semibold text-zinc-900">Median: {money(point.p50)}</p>
              <p>25th: {money(point.p25)}</p>
              <p>10th: {money(point.p10)}</p>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
