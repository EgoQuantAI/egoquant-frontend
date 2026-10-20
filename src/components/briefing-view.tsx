"use client";

import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Deck, type Section, type Slide } from "@/components/deck";
import type { BriefingJob } from "@/components/use-briefing-job";
import { Loader, Skeleton } from "@/components/ui/loader";
import type {
  AreaInstrument, Briefing, BriefingAggregate, BriefingItem, CoverageStatus, FundTone, HoldingGroup, Report, SourceTier,
} from "@/lib/egoquant";

// Agent D's market briefing (egoquant/briefing), shown alongside the portfolio. It never changes the numbers.
// Every sentence and number comes from the backend; this file lays it out:
//   a fixed header (week/month) over a slide deck: Overview (What changed, every fund at a glance) · one slide per fund
//   you hold · one per area you follow · Where this news comes from · How it works.
//   The full briefing comes from a backend job (rates every headline); until it is done the deck's own outline shimmers
//   in place with the progress (the header and every other report tab stay usable), and the deck fades in when ready.
//   Older backends without jobs fall back to the briefing inside the portfolio response.

type Period = "week" | "month";

const UNAVAILABLE = "News briefing unavailable right now; your portfolio is unaffected.";
// A saved report keeps the week view only when its news is too large to store with both (egoquant_routes.py size rule).
const NO_MONTH = "Saved reports keep this week's news. Open your live portfolio for the month view.";

const HOW_IT_WORKS: { title: string; text: string }[] = [
  { title: "Collects", text: "every 15 minutes it reads free news feeds for the funds you hold and the areas you follow (headline, link and date only; never full articles)." },
  { title: "Cleans", text: "removes duplicates, automated pages and items without a reliable date." },
  { title: "Links", text: "connects each headline to the funds it is about (ticker, fund name or topic), and to what your funds hold (for example Fed news for a Treasury-bill fund)." },
  { title: "Rates", text: "an AI model answers one question per headline and fund: is this good, bad or neutral news for someone who holds this fund? On 120 headlines labelled by our team it agreed with the human label 85% of the time (a standard model, FinBERT, 53%)." },
  { title: "Scores", text: "per fund, a weighted average from −1 to +1 (trusted and recent sources count more), pulled toward 0 when there are only a few headlines, with a confidence label: high, medium or low." },
  { title: "Compares", text: "this week vs last week (or month vs month)." },
  { title: "Reports", text: "every clear change in the news about a fund you hold. If the tone FALLS by 0.5 or more (the fund is over 5% of your portfolio and both periods have medium or high confidence), or a fund over 5% of your portfolio closes 10% or more below its 21-day high, it offers a risk-profile re-check; a rise is reported without the offer, and areas you only follow never trigger it. Nothing changes unless you confirm." },
];

// ─── Tone words and colours (always word + arrow, never colour alone; WCAG AA pairs) ───────────────────────────

type ToneKind = "positive" | "neutral" | "negative" | "none";
const TONE_STYLE: Record<ToneKind, { color: string; background: string; arrow: string }> = {
  positive: { color: "#1B7F3B", background: "#E6F4EA", arrow: "▲" },
  neutral: { color: "#1F5FA8", background: "#E8F0FB", arrow: "●" },
  negative: { color: "#B42318", background: "#FDECEA", arrow: "▼" },
  none: { color: "#5F6368", background: "#F1F3F4", arrow: "●" },
};

/** The backend's fixed bands (briefing config tone.display: strong 0.5, slight 0.15). */
function toneWords(v: number): string {
  if (v >= 0.5) return "mostly positive";
  if (v >= 0.15) return "slightly positive";
  if (v > -0.15) return "mixed or neutral";
  if (v > -0.5) return "slightly negative";
  return "mostly negative";
}
function toneKind(v: number): ToneKind {
  return v >= 0.15 ? "positive" : v <= -0.15 ? "negative" : "neutral";
}
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Badge({ kind, children }: { kind: ToneKind; children: ReactNode }) {
  const s = TONE_STYLE[kind];
  return (
    <span className="inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-semibold"
          style={{ color: s.color, background: s.background }}>
      <span aria-hidden="true">{s.arrow}</span>
      {children}
    </span>
  );
}

function FundToneBadge({ ft, theme }: { ft: FundTone; theme?: string }) {
  const kind: ToneKind = ft.label === "positive" ? "positive" : ft.label === "negative" ? "negative" : "neutral";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge kind={kind}>
        {ft.label} for holders of {ft.ticker}{ft.method === "finbert" && <span className="font-normal"> (FinBERT)</span>}
      </Badge>
      <span className="border border-zinc-200 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {theme ? `About what ${ft.ticker} holds: ${theme}` : "About this fund"}
      </span>
    </span>
  );
}

const TIER_FALLBACK: Record<SourceTier, string> = {
  tier1: "Established", tier2: "Opinion & analysis", unrated: "Not yet reviewed", tier3: "Automated pages",
};

// ─── Small helpers ──────────────────────────────────────────────────────────────────────────────────────────────

function day(iso: string, withYear = true) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", {   // UTC: the news window's own days,
    day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC",  // as in the report header
  });
}

/** Only plain web links become clickable. */
function safeUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function share(w: number | null | undefined): string {
  if (typeof w !== "number") return "";
  return w > 0 && w < 0.01 ? "under 1%" : `${Math.round(w * 100)}%`;
}

const areaName = (id: string) => {
  const t = id.replace(/_/g, " ");
  return t === "us stocks" ? "U.S. stocks" : t.charAt(0).toUpperCase() + t.slice(1);
};

function fundTones(it: BriefingItem): FundTone[] {
  return it.tone_by_fund ?? it.fund_tones ?? [];
}
function inPeriod(it: BriefingItem, b: Briefing): boolean {
  if (it.item.date_status === "unknown") return true;
  const t = new Date(it.item.published_at).getTime();
  return t > new Date(b.period_start).getTime() && t <= new Date(b.period_end).getTime();
}
function newestFirst(a: BriefingItem, b: BriefingItem) {
  const unknown = Number(a.item.date_status === "unknown") - Number(b.item.date_status === "unknown");
  return unknown || new Date(b.item.published_at).getTime() - new Date(a.item.published_at).getTime();
}

// ─── View model (newer backend fields, else derived from the older ones) ────────────────────────────────────────

type Counts = { pos: number; neu: number; neg: number; unrated: number };
type Card = { subject: string; agg?: BriefingAggregate; weight: number; status: CoverageStatus; counts: Counts;
              shown: BriefingItem[]; children: Card[] };
type GroupView = { group: HoldingGroup; cards: Card[]; quiet: string[] };
type ViewModel = {
  b: Briefing;
  words: { this: string; last: string };
  holdings: Card[];
  quiet: string[];
  groups: GroupView[];
  small: Set<string>;
  areas: Card[];
  nAreas: number;
  low: BriefingItem[];
};

function countsFor(agg: BriefingAggregate | undefined, items: BriefingItem[], tickers: string[] | null): Counts {
  if (agg && typeof agg.n_positive === "number") {
    return { pos: agg.n_positive ?? 0, neu: agg.n_neutral ?? 0, neg: agg.n_negative ?? 0, unrated: agg.n_unrated ?? 0 };
  }
  const c: Counts = { pos: 0, neu: 0, neg: 0, unrated: 0 };
  for (const it of items) {
    if (it.source_tier === "tier3") continue;
    const vals = fundTones(it).filter((f) => !tickers || tickers.includes(f.ticker)).map((f) => f.value);
    if (vals.length === 0) { c.unrated++; continue; }
    const v = vals.reduce((a, x) => a + x, 0) / vals.length;
    if (v > 1e-9) c.pos++; else if (v < -1e-9) c.neg++; else c.neu++;
  }
  return c;
}

function statusFor(agg: BriefingAggregate | undefined, counts: Counts): CoverageStatus {
  if (agg?.coverage_status) return agg.coverage_status;
  const n = counts.pos + counts.neu + counts.neg;
  if (typeof agg?.tone === "number") return { state: "tone", n, needed: 3, n_waiting: counts.unrated };
  if (n === 0 && counts.unrated > 0) return { state: "not_yet_assessed", n: 0, needed: 3, n_waiting: counts.unrated };
  return { state: "not_enough_coverage", n, needed: 3, n_waiting: counts.unrated };
}

function buildView(b: Briefing, report: Report): ViewModel {
  const words = b.period_words ?? (b.briefing_period === "month"
    ? { this: "this month", last: "last month" } : { this: "this week", last: "last week" });
  const byId = new Map(b.items.map((it) => [it.item.id, it]));
  const current = b.items.filter((it) => inPeriod(it, b));
  const lowIds = new Set(b.low_reliability_items ?? current.filter((it) => it.source_tier === "tier3").map((it) => it.item.id));
  const usable = current.filter((it) => !lowIds.has(it.item.id));
  const inst = new Map(b.instrument_aggregates.map((a) => [a.subject, a]));

  const weights = new Map<string, number>();
  for (const a of b.instrument_aggregates) if (a.held && typeof a.weight === "number") weights.set(a.subject, a.weight);
  if (weights.size === 0) for (const row of report.allocation ?? []) if (row.weight > 0) weights.set(row.asset_id, row.weight);
  const order = (b.holdings_order ?? [...weights.keys()].sort((x, y) => (weights.get(y) ?? 0) - (weights.get(x) ?? 0)))
    .filter((t) => weights.has(t) || inst.get(t)?.held);
  const chosen = b.chosen_areas ?? b.area_aggregates.map((a) => a.subject);
  const areaAggs = new Map(b.area_aggregates.map((a) => [a.subject, a]));

  // Which card SHOWS each headline: the backend says so (headline_ids); otherwise the same rule here.
  const fromBackend = b.instrument_aggregates.some((a) => a.headline_ids) || b.area_aggregates.some((a) => a.headline_ids);
  const shownOn = new Map<string, BriefingItem[]>();
  if (fromBackend) {
    for (const a of [...b.instrument_aggregates, ...b.area_aggregates]) {
      shownOn.set(a.subject, (a.headline_ids ?? []).map((id) => byId.get(id)).filter((x): x is BriefingItem => !!x));
    }
  } else {
    for (const it of [...usable].sort(newestFirst)) {
      const held = it.matched_tickers.filter((t) => weights.has(t)).sort((x, y) => (weights.get(y) ?? 0) - (weights.get(x) ?? 0));
      const area = (it.matched_areas ?? []).find((a) => chosen.includes(a));
      const home = held[0] ?? area;
      if (home) shownOn.set(home, [...(shownOn.get(home) ?? []), it]);
    }
  }

  const holdings: Card[] = [];
  const quiet: string[] = [];
  for (const t of order) {
    const agg = inst.get(t);
    const mine = usable.filter((it) => it.matched_tickers.includes(t));
    const counts = countsFor(agg, mine, [t]);
    const status = statusFor(agg, counts);
    const shown = (shownOn.get(t) ?? []).sort(newestFirst);
    const isQuiet = status.state === "quiet" || (!agg?.coverage_status && mine.length === 0 && status.state !== "tone");
    if (isQuiet) quiet.push(t);
    else holdings.push({ subject: t, agg, weight: weights.get(t) ?? agg?.weight ?? 0, status, counts, shown, children: [] });
  }

  const cards = new Map<string, Card>();
  for (const a of chosen) {
    const agg = areaAggs.get(a) ?? { subject: a, kind: "area" as const, tone: null, text: "" };
    const mine = usable.filter((it) => (it.matched_areas ?? []).includes(a));
    const counts = countsFor(areaAggs.get(a), mine, null);
    cards.set(a, { subject: a, agg, weight: 0, status: statusFor(areaAggs.get(a), counts), counts,
                   shown: (shownOn.get(a) ?? []).sort(newestFirst), children: [] });
  }
  const areas: Card[] = [];
  for (const a of chosen) {
    const card = cards.get(a)!;
    const parent = card.agg?.parent_area;
    if (parent && cards.has(parent)) cards.get(parent)!.children.push(card);
    else areas.push(card);
  }
  const low = current.filter((it) => lowIds.has(it.item.id)).sort(newestFirst);
  const small = new Set(b.small_positions ?? []);
  const groups: GroupView[] = (b.holding_groups ?? []).map((group) => ({
    group,
    cards: holdings.filter((c) => group.tickers.includes(c.subject)),
    quiet: quiet.filter((t) => group.tickers.includes(t)),
  }));
  return { b, words, holdings, quiet, groups, small, areas, nAreas: chosen.length, low };
}

// ─── Pieces ─────────────────────────────────────────────────────────────────────────────────────────────────────

function Headline({ it, b }: { it: BriefingItem; b: Briefing }) {
  const href = safeUrl(it.item.url);
  const publisher = it.publisher || it.item.source_name;
  const feed = it.item.feed && it.item.feed !== publisher ? it.item.feed : null;
  const tier = it.source_tier;
  const tierLabel = tier ? (b.tier_legend?.find((t) => t.tier === tier)?.label ?? TIER_FALLBACK[tier]) : null;
  const status = it.item.date_status ?? "published";
  const when = status === "unknown" ? "date unknown"
    : status === "updated_only" ? `updated ${day(it.item.published_at, false)}` : day(it.item.published_at);
  const tones = fundTones(it);
  const title = it.summary_kind === "withheld" ? it.summary : it.item.title;
  return (
    <div className={`border-l-4 py-1.5 pl-3 pr-2 transition-colors duration-200 ${
      href ? "border-zinc-200 hover:border-zinc-900 hover:bg-zinc-50" : "border-zinc-100"}`}>
      <p className="text-sm leading-snug text-zinc-900">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow"
             className="group/link underline decoration-zinc-300 decoration-1 underline-offset-4 transition-colors hover:decoration-zinc-900">
            {title}
            <span aria-hidden="true" className="ml-1 inline-block text-xs text-zinc-400 transition-transform duration-200 group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5 group-hover/link:text-zinc-900">↗</span>
            <span className="sr-only"> (opens the source in a new tab)</span>
          </a>
        ) : title}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
        <span className="font-medium text-zinc-700">{publisher}</span>
        {tierLabel && (
          <span className={`border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider ${
            tier === "tier1" ? "border-zinc-700 text-zinc-800" : "border-zinc-300 text-zinc-500"}`}>
            {tierLabel}
          </span>
        )}
        {feed && <span className="text-[11px] text-zinc-400">via {feed}</span>}
        <span aria-hidden="true">·</span>
        <span>{when}</span>
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {tier === "tier3"
          ? <Badge kind="none">not used for the score</Badge>
          : tones.length > 0
            ? tones.map((ft) => (
                <FundToneBadge key={ft.ticker} ft={ft}
                               theme={it.exposure_of?.[ft.ticker] ? (it.exposure_labels?.[ft.ticker] ?? it.exposure_of[ft.ticker]) : undefined} />
              ))
            : <Badge kind="none">not rated yet</Badge>}
        {it.exposure_text && <span className="text-xs text-zinc-500">{it.exposure_text}</span>}
      </div>
      {it.summary_kind === "llm" && it.summary && (
        <p className="mt-1 text-xs leading-relaxed text-zinc-600">{it.summary}</p>
      )}
    </div>
  );
}

function ElsewhereNote({ agg }: { agg?: BriefingAggregate }) {
  if (!agg) return null;
  const parts: string[] = [];
  if (agg.n_shown_under_holdings) parts.push(`+${agg.n_shown_under_holdings} shown under My portfolio`);
  for (const [where, n] of Object.entries(agg.shown_under ?? {})) {
    if (n > 0) parts.push(`+${n} shown under ${/^[A-Z0-9.]+$/.test(where) ? where : areaName(where)}`);
  }
  return parts.length ? <p className="mt-2 text-xs text-zinc-500">{parts.join(" · ")}</p> : null;
}

/** "3 positive · 5 neutral · 1 negative (9 headlines)", then "score +0.27 · slightly positive · medium confidence
 *  (9 headlines)", or a final state: quiet, or not rated. Never a stuck "in progress". */
function Rating({ card, words }: { card: Card; words: { this: string; last: string } }) {
  const { pos, neu, neg, unrated } = card.counts;
  const n = pos + neu + neg;
  const agg = card.agg;
  const noun = words.this.split(" ").pop() ?? "week";
  const conf = agg?.confidence;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <p className="text-sm text-zinc-800">
        {n > 0 ? (
          <>
            <span style={{ color: TONE_STYLE.positive.color }} className="font-semibold">{pos} positive</span> ·{" "}
            <span style={{ color: TONE_STYLE.neutral.color }} className="font-semibold">{neu} neutral</span> ·{" "}
            <span style={{ color: TONE_STYLE.negative.color }} className="font-semibold">{neg} negative</span>{" "}
            <span className="text-zinc-500">({plural(n, "headline")})</span>
          </>
        ) : <span className="text-zinc-500">No rated headlines {words.this}.</span>}
        {unrated > 0 && <span className="text-zinc-500"> · {plural(unrated, "headline")} not rated yet</span>}
        {(agg?.n_exposure ?? 0) > 0 && (
          <span className="text-zinc-500"> · {agg!.n_exposure} about what {card.subject} holds</span>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {card.status.state === "tone" && typeof agg?.tone === "number" ? (
          <Badge kind={toneKind(agg.tone)}>
            score {signed(agg.tone)} · {toneWords(agg.tone)}
            {conf && <> · {conf} confidence ({plural(n, "headline")})</>}
          </Badge>
        ) : card.status.state === "quiet" ? (
          <Badge kind="none">Quiet {noun}: no news about {card.subject} or what it holds</Badge>
        ) : card.status.state === "unrated" || card.status.state === "not_yet_assessed" ? (
          <Badge kind="none">not rated ({plural(card.status.n_waiting || unrated, "headline")}; no rating available)</Badge>
        ) : (
          <Badge kind="none">not enough coverage ({plural(card.status.n, "headline")}; needs {card.status.needed})</Badge>
        )}
        {agg && typeof agg.change === "number" && typeof agg.tone_previous === "number" && (
          <span className="text-xs text-zinc-600">
            <span style={{ color: TONE_STYLE[toneKind(agg.change)].color }} className="font-semibold">
              <span aria-hidden="true">{TONE_STYLE[toneKind(agg.change)].arrow} </span>{signed(agg.change)}
            </span>{" "}
            vs {words.last} ({signed(agg.tone_previous)})
          </span>
        )}
        {agg && typeof agg.change !== "number" && agg.compare_note && card.status.state === "tone" && (
          <span className="text-xs text-zinc-500">{agg.compare_note.charAt(0).toUpperCase() + agg.compare_note.slice(1)}.</span>
        )}
      </div>
    </div>
  );
}

function WhatChanged({ lines, b, words, offer }: {
  lines: string[]; b: Briefing; words: { this: string; last: string }; offer: boolean;
}) {
  const threshold = b.alert_threshold ?? 0.5;
  const move = b.largest_move;
  return (
    <section aria-labelledby="wc-title" className="border-2 border-zinc-900 p-4">
      <h3 id="wc-title" className="text-[11px] font-semibold uppercase tracking-widest text-zinc-900">What changed</h3>
      {lines.length > 0 ? (
        <>
          <ul className="mt-2 flex flex-col gap-2">
            {lines.map((line, i) => <li key={i} className="text-sm leading-relaxed text-zinc-800">{line}</li>)}
          </ul>
          {offer && <div className="mt-3 flex flex-wrap items-center gap-3">
            <Link href="/questionnaire"
                  className="border-2 border-zinc-900 bg-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900">
              Re-check my risk profile
            </Link>
            <span className="text-xs text-zinc-500">Nothing changes unless you confirm.</span>
          </div>}
        </>
      ) : move ? (
        <p className="mt-2 text-sm text-zinc-700">
          No notable changes {words.this}. Largest news-tone move: {move.kind === "area" ? areaName(move.subject) : move.subject}{" "}
          {signed(move.change)} (alerts start at ±{threshold.toFixed(1)}).
        </p>
      ) : (
        <p className="mt-2 text-sm text-zinc-700">No fund you hold can be compared with {words.last} yet.</p>
      )}
      {lines.length === 0 && (b.compare_notes ?? []).length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 text-xs text-zinc-500" aria-label="Funds that cannot be compared">
          {(b.compare_notes ?? []).map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </section>
  );
}

function QuietLine({ tickers, words }: { tickers: string[]; words: { this: string } }) {
  if (tickers.length === 0) return null;
  const noun = words.this.split(" ").pop() ?? "week";
  const list = tickers.length === 1 ? tickers[0] : `${tickers.slice(0, -1).join(", ")} and ${tickers[tickers.length - 1]}`;
  return (
    <p className="text-xs text-zinc-500">
      Quiet {noun}: no news about {list} or what {tickers.length === 1 ? "it holds" : "they hold"}.
    </p>
  );
}

const STATUS_TEXT: Record<AreaInstrument["status"], (i: AreaInstrument) => string> = {
  held: () => "in your portfolio",
  not_held: () => "not in your portfolio",
  above_risk_level: (i) => `above your risk level${i.r_level ? ` (R${i.r_level})` : ""}, information only`,
};

const eyebrow = "text-[10px] font-semibold uppercase tracking-widest text-zinc-400";

/** A list that scrolls on its own inside a slide (the slide itself never moves). Soft fades at the top and bottom
 *  show there is more; the page wheel, trackpad, touch and the arrow keys (once focused) scroll it as usual. */
function ScrollList<T>({ items, render, itemKey, listClassName = "flex flex-col gap-2", noun = "items" }: {
  items: T[]; render: (item: T, index: number) => ReactNode; itemKey: (item: T, index: number) => string;
  listClassName?: string; noun?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const update = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const next = { top: el.scrollTop > 2, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 2 };
    setEdges((prev) => (prev.top === next.top && prev.bottom === next.bottom ? prev : next));
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [update, items.length]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={box} onScroll={update} tabIndex={0} aria-label={`${items.length} ${noun}`}
           className="eq-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 outline-none focus-visible:ring-2 focus-visible:ring-zinc-300">
        <div className={listClassName}>
          {items.map((item, i) => <div key={itemKey(item, i)}>{render(item, i)}</div>)}
        </div>
      </div>
      <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white to-transparent transition-opacity duration-300 ${edges.top ? "opacity-100" : "opacity-0"}`} />
      {/* The hint sits under the list: drawn over the last rows it hid them and read as a glitch (Umut, 20 Oct). */}
      {/* The hint row is always there (only its opacity changes), so showing it never resizes the list. */}
      <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 bottom-4 h-4 bg-gradient-to-t from-white to-transparent transition-opacity duration-300 ${
        edges.bottom ? "opacity-100" : "opacity-0"}`} />
      <p aria-hidden="true" className={`h-4 shrink-0 text-center text-[10px] font-semibold uppercase leading-4 tracking-widest text-zinc-400 transition-opacity duration-300 ${
        edges.bottom ? "opacity-100" : "opacity-0"}`}>
        Scroll for more ↓
      </p>
    </div>
  );
}

/** The full list in a large popup: room to read and scroll. Rendered into <body> (the deck's sliding track would
 *  otherwise trap a fixed overlay), and its keys and gestures stop here, so they never move the deck behind it. */
function HeadlinesDialog({ kicker, title, items, b, onClose }: {
  kicker: string; title: string; items: BriefingItem[]; b: Briefing; onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    closeButton.current?.focus({ preventScroll: true });
    return () => before?.focus({ preventScroll: true });
  }, []);
  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
  return createPortal(
    <div className="eq-backdrop fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 p-3 md:p-8"
         onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
         onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}
         onPointerDown={stop} onPointerUp={stop} onWheel={stop}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId}
           className="eq-pop flex h-full max-h-[880px] w-full max-w-4xl flex-col border-2 border-zinc-900 bg-white">
        <div className="flex shrink-0 items-start justify-between gap-6 border-b-2 border-zinc-900 px-5 py-4 md:px-8 md:py-5">
          <div className="min-w-0">
            <p className={eyebrow}>{kicker}</p>
            <h3 id={titleId} className="mt-1 font-heading text-3xl leading-tight text-zinc-900">{title}</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {plural(items.length, "headline")} · newest first · click a headline to read it at the source <span aria-hidden="true">↗</span>
            </p>
          </div>
          <button ref={closeButton} type="button" onClick={onClose}
                  className="shrink-0 border-2 border-zinc-900 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white">
            Close <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-5 py-4 md:px-8 md:py-6">
          <ScrollList items={items} itemKey={(it) => it.item.id} noun="headlines" listClassName="flex flex-col gap-3"
                      render={(it) => <Headline it={it} b={b} />} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A slide's headlines: a preview that scrolls in place, and "Open all" for the full list in a popup. */
function HeadlineBlock({ heading, kicker, dialogTitle, items, b, className = "" }: {
  heading: string; kicker: string; dialogTitle: string; items: BriefingItem[]; b: Briefing; className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return <div className="flex-1" />;
  return (
    <div className={`flex min-h-0 flex-1 flex-col ${className}`} aria-label={dialogTitle}>
      <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
        <p className={eyebrow}>{heading} · {items.length}</p>
        <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
                className="group flex items-center gap-2 border-2 border-zinc-900 bg-zinc-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900">
          Open all {items.length}
          <span aria-hidden="true" className="transition-transform duration-300 group-hover:scale-110">⤢</span>
        </button>
      </div>
      <ScrollList items={items} itemKey={(it) => it.item.id} noun="headlines" listClassName="flex flex-col gap-2.5"
                  render={(it) => <Headline it={it} b={b} />} />
      <p className="mt-1 shrink-0 text-[10px] text-zinc-400">Click a headline to read it at the source <span aria-hidden="true">↗</span></p>
      {open && <HeadlinesDialog kicker={kicker} title={dialogTitle} items={items} b={b} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Headlines about one fund or area. */
function HeadlineList({ items, b, label }: { items: BriefingItem[]; b: Briefing; label: string }) {
  return <HeadlineBlock heading="Headlines" kicker="Market briefing" dialogTitle={`Headlines about ${label}`}
                        items={items} b={b} className="mt-3" />;
}

const CALCULATION = (period: Period) => [
  "Each headline counts +1 (good news), 0 (neutral) or −1 (bad news) for holders of the fund. The score is their weighted average, from −1 to +1.",
  "Established sources count 1.0, opinion & analysis 0.7, sources we have not reviewed yet 0.4, automated pages 0.",
  `Recent headlines count more: a headline's weight halves every ${period === "month" ? "10 days in the monthly view" : "3 days in the weekly view"}.`,
  "A headline about what a fund holds (for example Fed news for a Treasury-bill fund) counts 0.6 of one about the fund itself.",
  "With only a few headlines the score is pulled toward 0: score = sum of (weight × rating) ÷ (sum of weights + 1.5). Confidence follows the sum of weights: high from 4, medium from 1.5, low below.",
  "A re-check offer appears when the score falls by 0.5 or more versus the previous period, both periods have medium or high confidence, and the fund is more than 5% of your portfolio. A rise of the same size is reported without the offer.",
];

/** A compact tone mark for lists: arrow + score, or the state in one word. */
function MiniTone({ card }: { card: Card }) {
  const agg = card.agg;
  if (card.status.state === "tone" && typeof agg?.tone === "number") {
    const s = TONE_STYLE[toneKind(agg.tone)];
    return (
      <span className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold tabular-nums"
            style={{ color: s.color, background: s.background }}>
        <span aria-hidden="true">{s.arrow}</span>{signed(agg.tone)}
        <span className="sr-only"> {toneWords(agg.tone)}</span>
      </span>
    );
  }
  const word = card.status.state === "quiet" ? "quiet" : card.status.state === "not_enough_coverage" ? "few headlines" : "not rated";
  return <span className="text-[11px] text-zinc-400">{word}</span>;
}

// ─── Slides ─────────────────────────────────────────────────────────────────────────────────────────────────────

function SlideFrame({ kicker, title, aside, children, tone = "plain" }: {
  kicker: string; title: ReactNode; aside?: ReactNode; children: ReactNode; tone?: "plain" | "ink";
}) {
  return (
    <article className={`flex h-full min-h-0 flex-col border-2 p-4 md:px-6 md:py-5 ${tone === "ink" ? "border-zinc-900" : "border-zinc-200"}`}>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className={eyebrow}>{kicker}</p>
          <h3 className="mt-0.5 font-heading text-2xl leading-tight text-zinc-900 xl:text-3xl">{title}</h3>
        </div>
        {aside}
      </div>
      {children}
    </article>
  );
}

function Weight({ weight }: { weight: number }) {
  return (
    <div className="text-right">
      <p className="font-heading text-3xl leading-none tabular-nums text-zinc-900 xl:text-4xl">{share(weight)}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">of your portfolio</p>
    </div>
  );
}

function WeightBar({ weight }: { weight: number }) {
  return (
    <div className="mt-3 h-1 w-full shrink-0 bg-zinc-100" aria-hidden="true">
      <div className="h-1 bg-zinc-900" style={{ width: `${Math.max(1, Math.min(100, weight * 100))}%` }} />
    </div>
  );
}

function HoldingSlide({ card, v, small }: { card: Card; v: ViewModel; small: boolean }) {
  const name = card.agg?.name;
  return (
    <SlideFrame kicker={small ? "Small position · a fund you hold" : "A fund you hold"}
                title={<>{card.subject}{name && <span className="ml-3 font-sans text-sm font-normal text-zinc-500">{name}</span>}</>}
                aside={<Weight weight={card.weight} />}>
      <WeightBar weight={card.weight} />
      <div className="shrink-0"><Rating card={card} words={v.words} /></div>
      <HeadlineList items={card.shown} b={v.b} label={card.subject} />
      <div className="shrink-0"><ElsewhereNote agg={card.agg} /></div>
      <p className="mt-2 shrink-0 text-[11px] text-zinc-400">News about a fund you own can trigger a risk-profile re-check offer.</p>
    </SlideFrame>
  );
}

/** More than 6 holdings: one slide per exposure theme with the group tone; its funds follow as their own slides. */
function GroupSlide({ gv, v }: { gv: GroupView; v: ViewModel }) {
  const g = gv.group;
  const a = g.aggregate;
  const counts: Counts = { pos: a.n_positive ?? 0, neu: a.n_neutral ?? 0, neg: a.n_negative ?? 0, unrated: a.n_unrated ?? 0 };
  const card: Card = { subject: g.label, agg: a, weight: g.weight, counts, shown: [], children: [],
                       status: a.coverage_status ?? statusFor(a, counts) };
  return (
    <SlideFrame kicker={`Group · ${plural(g.tickers.length, "fund")}`} title={g.label} aside={<Weight weight={g.weight} />}>
      <WeightBar weight={g.weight} />
      <div className="shrink-0">
        {card.status.state === "quiet"
          ? <p className="mt-3"><Badge kind="none">Quiet {v.words.this.split(" ").pop()}: no news about these funds or what they hold</Badge></p>
          : <Rating card={card} words={v.words} />}
      </div>
      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <p className={`${eyebrow} mb-2`}>Funds in this group</p>
        <ScrollList items={gv.cards} itemKey={(c) => c.subject} noun="funds" listClassName="grid grid-cols-1 gap-2 sm:grid-cols-2"
               render={(c) => (
                 <div className="flex items-center justify-between gap-3 border-l-4 border-zinc-200 py-1 pl-3">
                   <span className="text-sm font-semibold text-zinc-900">{c.subject}
                     <span className="ml-2 font-normal text-zinc-500">{share(c.weight)}</span></span>
                   <MiniTone card={c} />
                 </div>
               )} />
        <div className="mt-2 shrink-0"><QuietLine tickers={gv.quiet} words={v.words} /></div>
      </div>
    </SlideFrame>
  );
}

function AreaSlide({ card, v, parent }: { card: Card; v: ViewModel; parent?: string }) {
  const inst = card.agg?.instruments ?? [];
  return (
    <SlideFrame kicker={parent ? `An area you follow · within ${areaName(parent)}` : "An area you follow"} title={areaName(card.subject)}>
      <div className="shrink-0"><Rating card={card} words={v.words} /></div>
      {inst.length > 0 && (
        <ul className="mt-3 flex shrink-0 flex-wrap gap-1.5 text-xs" aria-label={`Instruments in ${areaName(card.subject)}`}>
          {inst.slice(0, 8).map((i) => (
            <li key={i.ticker} className={`border px-1.5 py-0.5 ${i.status === "held" ? "border-zinc-700 text-zinc-900" : "border-zinc-200 text-zinc-500"}`}>
              <span className="font-semibold">{i.ticker}</span> {STATUS_TEXT[i.status](i)}
            </li>
          ))}
          {inst.length > 8 && <li className="px-1.5 py-0.5 text-zinc-400">+{inst.length - 8} more</li>}
        </ul>
      )}
      <HeadlineList items={card.shown} b={v.b} label={areaName(card.subject)} />
      <div className="shrink-0"><ElsewhereNote agg={card.agg} /></div>
      <p className="mt-2 shrink-0 text-[11px] text-zinc-400">
        Context only: news about an area you don&apos;t own never changes your portfolio and never triggers alerts by itself.
      </p>
    </SlideFrame>
  );
}

function OverviewSlide({ v, lines, offer, holdingCards }: {
  v: ViewModel; lines: string[]; offer: boolean; holdingCards: Card[];
}) {
  // The newest headlines across every card, once each: the overview's own reading list.
  const seen = new Set<string>();
  const latest = [...v.holdings, ...v.areas, ...v.areas.flatMap((a) => a.children)]
    .flatMap((c) => c.shown)
    .filter((it) => (seen.has(it.item.id) ? false : (seen.add(it.item.id), true)))
    .sort(newestFirst);
  const roomy = holdingCards.length <= 4;
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-5 md:grid-cols-[3fr_2fr]">
      <div className="flex min-h-0 flex-col gap-4">
        {v.b.banners.map((text, i) => (
          <p key={i} role="note" className="shrink-0 border-l-4 border-zinc-900 pl-4 text-sm font-semibold text-zinc-900">{text}</p>
        ))}
        <div className="shrink-0"><WhatChanged lines={lines} b={v.b} words={v.words} offer={offer} /></div>
        {latest.length > 0 ? (
          <HeadlineBlock heading="Latest headlines" kicker={`Market briefing · ${v.words.this}`}
                         dialogTitle="All the latest headlines" items={latest} b={v.b} />
        ) : <div className="flex-1" />}
      </div>
      <div className="flex min-h-0 flex-col gap-4">
        <div className="grid shrink-0 grid-cols-3 border-2 border-zinc-900 px-4 py-3">
          {[[v.holdings.length + v.quiet.length, "funds"], [v.nAreas, "areas"], [v.b.items.length, "headlines"]].map(([n, text]) => (
            <div key={text as string}>
              <p className="font-heading text-4xl leading-none tabular-nums text-zinc-900">{n}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{text}</p>
            </div>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col border-2 border-zinc-200 p-4">
          <p className={`${eyebrow} mb-2`}>At a glance · your funds</p>
          {holdingCards.length > 0 ? (
            <ScrollList items={holdingCards} itemKey={(c) => c.subject} noun="funds" listClassName="flex flex-col"
                   render={(c) => (
                     <div className={`flex items-center gap-3 border-b border-zinc-100 ${roomy ? "py-3" : "py-2"}`}>
                       <span className={`w-14 shrink-0 font-semibold text-zinc-900 ${roomy ? "text-base" : "text-sm"}`}>{c.subject}</span>
                       <span className="h-1 flex-1 bg-zinc-100" aria-hidden="true">
                         <span className="block h-1 bg-zinc-900" style={{ width: `${Math.max(2, Math.min(100, c.weight * 100))}%` }} />
                       </span>
                       <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500">{share(c.weight)}</span>
                       <span className="w-20 shrink-0 text-right"><MiniTone card={c} /></span>
                     </div>
                   )} />
          ) : <p className="flex-1 text-xs text-zinc-500">No holdings to brief on.</p>}
          <div className="mt-2 shrink-0"><QuietLine tickers={v.quiet} words={v.words} /></div>
          <div className="mt-3 shrink-0 border-t border-zinc-100 pt-3"><ToneScale cards={holdingCards} /></div>
        </div>
      </div>
    </div>
  );
}

/** The tone scale, read for this portfolio: where the funds' news tone sits (weighted by each fund's share), its band lit. */
function ToneScale({ cards }: { cards: Card[] }) {
  const rated = cards.filter((c) => c.status.state === "tone" && typeof c.agg?.tone === "number");
  const total = rated.reduce((sum, c) => sum + Math.max(c.weight, 0), 0);
  const tone = rated.length === 0 ? null
    : total > 0 ? rated.reduce((sum, c) => sum + (c.agg!.tone as number) * Math.max(c.weight, 0), 0) / total
      : rated.reduce((sum, c) => sum + (c.agg!.tone as number), 0) / rated.length;
  const kind = tone === null ? "none" : toneKind(tone);
  const bands: { kind: ToneKind; flex: string }[] = [
    { kind: "negative", flex: "flex-[35]" }, { kind: "neutral", flex: "flex-[30]" }, { kind: "positive", flex: "flex-[35]" },
  ];
  return (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className={eyebrow}>Tone scale · −1 to +1</p>
        {tone !== null
          ? <span className="text-[11px] font-semibold tabular-nums" style={{ color: TONE_STYLE[kind].color }}>
              <span aria-hidden="true">{TONE_STYLE[kind].arrow} </span>your funds {signed(tone)} · {toneWords(tone)}
            </span>
          : <span className="text-[11px] text-zinc-400">no fund rated yet</span>}
      </div>
      <div className="relative" aria-hidden="true">
        <div className="flex h-1.5">
          {bands.map((band) => (
            <span key={band.kind} className={`${band.flex} transition-opacity duration-500`}
                  style={{ background: TONE_STYLE[band.kind].color, opacity: tone === null || band.kind === kind ? 1 : 0.2 }} />
          ))}
        </div>
        {tone !== null && (
          <span className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 bg-zinc-900 transition-[left] duration-500"
                style={{ left: `${Math.max(0, Math.min(100, (tone + 1) * 50))}%` }} />
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-zinc-500">
        <span>▼ negative ≤ −0.15</span><span>● mixed</span><span>positive ≥ +0.15 ▲</span>
      </div>
    </>
  );
}

function HowItWorksSlide() {
  return (
    <SlideFrame kicker="Method" title="How the briefing works">
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <ScrollList items={HOW_IT_WORKS} itemKey={(s) => s.title} noun="steps" listClassName="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2"
               render={(s) => (
                 <div className="flex gap-3">
                   <span className="font-heading text-2xl leading-none text-zinc-300 tabular-nums">
                     {String(HOW_IT_WORKS.indexOf(s) + 1).padStart(2, "0")}
                   </span>
                   <p className="text-xs leading-relaxed text-zinc-600"><span className="font-semibold text-zinc-900">{s.title}:</span> {s.text}</p>
                 </div>
               )} />
      </div>
      <p className="mt-3 shrink-0 border-l-4 border-zinc-900 pl-4 text-sm text-zinc-800">
        It never buys, sells or changes your portfolio, never forecasts prices, and sends no personal data to the AI.
      </p>
    </SlideFrame>
  );
}

function CalculationSlide({ period }: { period: Period }) {
  return (
    <SlideFrame kicker="Method" title="How the score is calculated">
      <div className="mt-4 flex min-h-0 flex-1 flex-col">
        <ScrollList items={CALCULATION(period)} itemKey={(text) => text.slice(0, 24)} noun="rules"
               listClassName="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2"
               render={(text) => <p className="border-l-4 border-zinc-200 pl-3 text-xs leading-relaxed text-zinc-700">{text}</p>} />
      </div>
    </SlideFrame>
  );
}

function SourcesSlide({ v }: { v: ViewModel }) {
  const b = v.b;
  const m = b.method_counts ?? {
    llm_fund_aware: b.metadata.n_fund_tones_llm, finbert: b.metadata.n_fund_tones_finbert,
    not_yet_assessed: b.metadata.n_fund_tones_unavailable,
  };
  const counts = b.tier_counts;
  const legend = b.tier_legend ?? [];
  const waiting = m.not_yet_assessed ?? 0;
  return (
    <SlideFrame kicker="Transparency" title="Where this news comes from">
      <div className="mt-4 shrink-0">
        {legend.length > 0 ? (
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500">
                <th scope="col" className="py-1.5 pr-3 font-semibold">Source type</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold">Headlines {v.words.this}</th>
                <th scope="col" className="py-1.5 font-semibold">Counts in the tone as</th>
              </tr>
            </thead>
            <tbody>
              {legend.map((t) => (
                <tr key={t.tier} className="border-b border-zinc-100 align-top">
                  <td className="py-1.5 pr-3"><span className="font-semibold text-zinc-900">{t.label}</span>
                    <span className="block text-zinc-500">{t.explanation}</span></td>
                  <td className="py-1.5 pr-3 tabular-nums">{counts?.[t.tier] ?? 0}</td>
                  <td className="py-1.5">{t.weight === null ? "not used" : t.weight.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-xs">Source ratings are not available for this briefing.</p>}
        {(b.single_tier_notes ?? []).map((n, i) => <p key={i} className="mt-2 text-xs text-zinc-600">{n}</p>)}
        <p className="mt-2 text-xs text-zinc-600">
          Ratings per headline and fund: {m.llm_fund_aware ?? 0} by the AI model
          {(m.finbert ?? 0) > 0 && <>, {m.finbert} by FinBERT (when the AI model was unavailable)</>}.
          {waiting > 0 && <> {plural(waiting, "headline")} {waiting === 1 ? "is" : "are"} still being rated.</>}
          {(b.n_date_unknown ?? 0) > 0 && <> {plural(b.n_date_unknown ?? 0, "headline")} without a date: listed, not used for the score.</>}
        </p>
      </div>
      {v.low.length > 0 ? (
        <HeadlineBlock heading="Automated pages, not used for the score" kicker="Where this news comes from"
                       dialogTitle="Automated pages (not used for the score)" items={v.low} b={b} className="mt-4" />
      ) : <div className="flex-1" />}
    </SlideFrame>
  );
}

function Progress({ job }: { job: BriefingJob }) {
  const pct = job.total > 0 ? Math.round((job.rated / job.total) * 100) : 0;
  const text = job.stage === "rating" && job.total > 0
    ? `Rating news for your funds ${job.rated} of ${job.total}`
    : job.stage === "building" ? "Putting the briefing together" : "Collecting news for your funds";
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The deck's outline: section chips, one slide, the rail. */}
      <div aria-hidden="true" className="flex shrink-0 gap-5 border-b-2 border-zinc-100 pb-2">
        {["w-20", "w-16", "w-24", "w-20", "w-14"].map((w, i) => <Skeleton key={i} className={`h-3 ${w}`} />)}
      </div>
      <div className="relative mt-4 grid min-h-[320px] flex-1 grid-cols-1 gap-6 md:min-h-0 md:grid-cols-[3fr_2fr]">
        <div aria-hidden="true" className="flex flex-col gap-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="mt-3 h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
        <div aria-hidden="true" className="hidden flex-col gap-3 md:flex">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        {/* What is happening, over the outline. */}
        <div className="absolute inset-x-0 top-1/2 mx-auto w-full max-w-md -translate-y-1/2 border-2 border-zinc-900 bg-white p-5">
          <Loader label={text} className="font-semibold text-zinc-900" />
          <div className="mt-3 h-1 w-full bg-zinc-100" aria-hidden="true">
            <div className="h-1 bg-zinc-900 transition-all duration-500"
                 style={{ width: `${job.stage === "rating" ? Math.max(4, pct) : job.stage === "building" ? 100 : 4}%` }} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            Every headline is rated for every fund it mentions, so this can take a minute the first time. The other
            tabs of your report are ready meanwhile.
          </p>
        </div>
      </div>
      <div aria-hidden="true" className="mt-3 flex shrink-0 items-center gap-4">
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-1 flex-1" />
        <Skeleton className="h-9 w-9" />
      </div>
    </div>
  );
}

// ─── The tab ────────────────────────────────────────────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  { id: "overview", label: "Overview" },
  { id: "portfolio", label: "My portfolio" },
  { id: "interests", label: "My interests" },
  { id: "sources", label: "Sources" },
  { id: "method", label: "How it works" },
];

function slidesFor(v: ViewModel, lines: string[], offer: boolean, period: Period): Slide[] {
  const slides: Slide[] = [];
  const own = (card: Card, small: boolean) => ({
    key: `fund-${card.subject}`, section: "portfolio", label: `${card.subject}${small ? " · small position" : ""}`,
    node: <HoldingSlide card={card} v={v} small={small} />,
  });
  const big = v.holdings.filter((c) => !v.small.has(c.subject));
  const small = v.holdings.filter((c) => v.small.has(c.subject));

  slides.push({ key: "overview", section: "overview", label: "Overview · what changed",
                node: <OverviewSlide v={v} lines={lines} offer={offer} holdingCards={v.holdings} /> });
  if (v.groups.length > 0) {
    for (const gv of v.groups) {
      slides.push({ key: `group-${gv.group.theme}`, section: "portfolio", label: gv.group.label, node: <GroupSlide gv={gv} v={v} /> });
      for (const c of gv.cards) slides.push(own(c, v.small.has(c.subject)));
    }
  } else {
    big.forEach((c) => slides.push(own(c, false)));
    small.forEach((c) => slides.push(own(c, true)));
  }
  const area = (card: Card, parent?: string) => {
    slides.push({ key: `area-${card.subject}`, section: "interests",
                  label: parent ? `${areaName(parent)} › ${areaName(card.subject)}` : areaName(card.subject),
                  node: <AreaSlide card={card} v={v} parent={parent} /> });
    card.children.forEach((child) => area(child, card.subject));
  };
  v.areas.forEach((c) => area(c));
  if (v.b.suitability_notes.length > 0) {
    slides.push({ key: "suitability", section: "interests", label: "Notes on your interests", node: (
      <SlideFrame kicker="Your interests" title="What fits your profile">
        <ul className="mt-5 flex flex-col gap-3">
          {v.b.suitability_notes.map((n, i) => <li key={i} className="border-l-4 border-zinc-200 pl-3 text-sm text-zinc-700">{n.text}</li>)}
        </ul>
      </SlideFrame>
    ) });
  }
  slides.push({ key: "sources", section: "sources", label: "Where this news comes from", node: <SourcesSlide v={v} /> });
  // How it works last: the news first, the method for whoever wants it (Umut, 20 Oct).
  slides.push({ key: "how", section: "method", label: "How the briefing works", node: <HowItWorksSlide /> });
  slides.push({ key: "calc", section: "method", label: "How the score is calculated", node: <CalculationSlide period={period} /> });
  return slides;
}

export function BriefingView({ report, job, pricesAsOf }: { report: Report; job?: BriefingJob; pricesAsOf?: string }) {
  const fromJob = job?.phase === "done" && job.result?.week ? job.result : null;
  const week = fromJob ? fromJob.week : report.market_briefing ?? null;
  const month = fromJob ? fromJob.month : report.market_briefing_month ?? null;
  const [period, setPeriod] = useState<Period>("week");
  const b = period === "month" && month ? month : week;
  const view = useMemo(() => (b ? buildView(b, report) : null), [b, report]);
  const running = job?.phase === "running";

  const lines = fromJob
    ? (period === "month" && month ? fromJob.what_changed_month : fromJob.what_changed) ?? []
    : period === "month" && month
      ? report.what_changed_month ?? []
      : report.what_changed ?? (b ? b.alerts.map((a) => a.summary || a.message) : []);
  // The re-check button: newer backends say when (negative tone moves only); older ones offered it for any line.
  const action = fromJob
    ? (period === "month" && month ? fromJob.what_changed_month_action : fromJob.what_changed_action)
    : period === "month" && month ? report.what_changed_month_action : report.what_changed_action;
  const offer = action === undefined ? lines.length > 0 : action === "offer_risk_profile_recheck";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-3">
        <div className="min-w-[240px] flex-1 basis-0">
          <p className={eyebrow}>News · read-only</p>
          <h2 className="mt-1 font-heading text-2xl leading-none text-zinc-900">Market Briefing</h2>
          <p className="mt-1.5 line-clamp-2 max-w-2xl text-[11px] leading-relaxed text-zinc-500 xl:line-clamp-1 [@media(max-height:800px)]:hidden">
            Tone is AI-assessed for holders of each fund (matched our human labels on 85% of 120 test headlines; FinBERT
            53%). It describes the news, it is not a forecast, and it never changes your portfolio.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div role="group" aria-label="Briefing period" className="flex border-2 border-zinc-900">
            {(["week", "month"] as const).map((p) => {
              const available = !running && (p === "week" || !!month);
              return (
                <button key={p} type="button" aria-pressed={period === p} disabled={!available}
                        title={available ? undefined : running ? "Available when the news is rated" : NO_MONTH}
                        onClick={() => setPeriod(p)}
                        className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-widest transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                          period === p ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 hover:bg-zinc-100"}`}>
                  {p === "week" ? "This week" : "This month"}
                </button>
              );
            })}
          </div>
          {!running && week && !month && (
            <p className="max-w-xs text-right text-[11px] leading-snug text-zinc-500">{NO_MONTH}</p>
          )}
          {b && !running && (
            <div className="flex items-center gap-3">
              <p className="text-[11px] tabular-nums text-zinc-500">
                News {day(b.period_start)} – {day(b.period_end)}{pricesAsOf && ` · prices as of ${day(pricesAsOf)}`}
              </p>
              {job?.refresh && (
                <button type="button" onClick={job.refresh}
                        className="border border-zinc-300 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600 hover:border-zinc-900 hover:text-zinc-900">
                  Refresh
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {running ? (
        <Progress job={job!} />
      ) : !b || !view ? (
        <div className="eq-fade flex min-h-0 flex-1 items-center">
          <div className="border-l-4 border-zinc-300 pl-4">
            <p className="text-sm text-zinc-700">{UNAVAILABLE}</p>
            {job?.refresh && (
              <button type="button" onClick={job.refresh}
                      className="mt-3 border-2 border-zinc-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white">
                Try again
              </button>
            )}
          </div>
        </div>
      ) : (
        <div key={fromJob ? "final" : "first"} className="eq-fade flex min-h-0 flex-1 flex-col">
          <Deck label="Market briefing" sections={SECTIONS} slides={slidesFor(view, lines, offer, period)}
                resetKey={`${period}-${b.period_end}`} />
        </div>
      )}
    </div>
  );
}
