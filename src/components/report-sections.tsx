"use client";

import Link from "next/link";
import { type KeyboardEvent, type ReactNode, useEffect, useState } from "react";
import { bannerBlocks } from "@/components/data-banners";
import { BriefingView } from "@/components/briefing-view";
import { GoalHistoryNotes, GoalMethod, GoalOutcome, GoalOutlook } from "@/components/goal-view";
import { MethodV2Card } from "@/components/method-v2";
import { Paged } from "@/components/paged";
import { AssetMix, Disclosures, Holdings, Limits, Panel, Reasons, Stress } from "@/components/report-view";
import { TradeCheck } from "@/components/trade-check";
import type { BriefingJob } from "@/components/use-briefing-job";
import { askHref } from "@/lib/ask";
import { type PortfolioResult, type Session, type TradingHistorySummary, type Universe, label, pct, priceLine } from "@/lib/egoquant";
import { chosenNote, methodV2Of } from "@/lib/method-v2";
import { setReportView } from "@/lib/report-view";

// The report's sections, one tab each, the same on the Portfolio page and on a saved report (Account → Open), so the
// two never drift apart. How it was built (Method) comes last: the results first, the method for whoever wants it.
// `session`: this browser's profile. The Trade check works on it (the current profile and limits, as on the Portfolio
// page), so its tab shows whenever the profile is complete. `live`: the report is this browser's latest build; only then
// does the "Ask the Advisor" link lead to /advisor, whose chat is about that build.

type Tab = { id: string; title: string };

export function reportTabs(result: PortfolioResult, tradeCheck: boolean): Tab[] {
  const goal = !!(result.goal && result.report.goal);
  return [
    { id: "summary", title: "Summary" },
    ...(goal ? [{ id: "goal", title: "Goal" }, { id: "outlook", title: "Outlook" }] : []),
    { id: "holdings", title: "Holdings" },
    { id: "limits", title: "Limits" },
    { id: "stress", title: "Stress" },   // stress tests and costs; short, so the tabs fit one row
    ...(tradeCheck ? [{ id: "trade", title: "Trade check" }] : []),
    { id: "news", title: "News" },   // always: the tab says so when the briefing is unavailable
    { id: "data", title: "Data" },
    // The goal simulation's method, and under portfolio method v2 how the weights were built (even without a goal).
    ...(goal || methodV2Of(result.report) ? [{ id: "method", title: "Method" }] : []),
    // Why last: the report's reasons, and the Advisor for any other "why" (it knows which tab is open) (Umut, 20 Oct).
    { id: "reasons", title: "Why" },
  ];
}

export function ReportSections({ result, amount, job, session, live = false }: {
  result: PortfolioResult; amount: number; job?: BriefingJob; session?: Session | null; live?: boolean;
}) {
  const trade = session?.answers && session.profile && session.intake ? session : undefined;
  const tabs = reportTabs(result, !!trade);
  const [tab, setTab] = useState("summary");
  const current = tabs.some((t) => t.id === tab) ? tab : "summary";
  const currentTitle = tabs.find((t) => t.id === current)?.title ?? "Summary";

  // Tell the Advisor panel beside the report which tab is on screen; nothing when the report goes away.
  useEffect(() => { setReportView({ id: current, title: currentTitle }); }, [current, currentTitle]);
  useEffect(() => () => setReportView(null), []);

  // Arrow keys move between tabs (the WAI-ARIA tabs pattern).
  function onTabKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.id === current);
    const next = tabs[(i + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    setTab(next.id);
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  return (
    <>
      <div role="tablist" aria-label="Report sections" onKeyDown={onTabKey}
           className="mt-6 flex shrink-0 gap-x-3 gap-y-1 overflow-x-auto [@media(max-height:800px)]:mt-3 border-b-2 border-zinc-100 md:flex-wrap md:overflow-visible">
        {tabs.map((t) => (
          <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={current === t.id}
                  aria-controls="report-panel" tabIndex={current === t.id ? 0 : -1} onClick={() => setTab(t.id)}
                  className={`eq-tab whitespace-nowrap pb-2.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
                    current === t.id ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-700"
                  }`}>
            {t.title}
          </button>
        ))}
      </div>

      <div key={current} id="report-panel" role="tabpanel" aria-labelledby={`tab-${current}`}
           className={`eq-enter mt-6 [@media(max-height:800px)]:mt-3 flex min-h-0 flex-1 flex-col ${current === "news" ? "md:overflow-hidden" : "md:overflow-y-auto"}`}>
        {current === "summary" && <Summary result={result} live={live} />}
        {current === "goal" && result.report.goal && <GoalOutcome goal={result.report.goal} />}
        {current === "outlook" && result.report.goal && <GoalOutlook goal={result.report.goal} />}
        {current === "holdings" && <Holdings report={result.report} amount={amount} />}
        {current === "reasons" && <WhyTab result={result} live={live} />}
        {current === "limits" && <Limits report={result.report} />}
        {current === "stress" && <Stress report={result.report} amount={amount} />}
        {current === "trade" && trade && <TradeCheck session={trade} result={result} />}
        {current === "news" && <BriefingView report={result.report} job={job} pricesAsOf={result.as_of} />}
        {current === "data" && <DataTab result={result} />}
        {current === "method" && <MethodTab result={result} />}
      </div>
    </>
  );
}

function WhyTab({ result, live }: { result: PortfolioResult; live: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-5 shrink-0 border-2 border-zinc-900 p-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Still wondering why?</p>
        <p className="mt-1 text-sm leading-relaxed text-zinc-900">
          Ask the Advisor. It knows this portfolio and follows the tab you are on, so you can ask about anything you see,
          any time: &ldquo;why this fund?&rdquo;, &ldquo;why so little in stocks?&rdquo;, &ldquo;what does this chart mean?&rdquo;.
        </p>
        {live && (
          <Link href={askHref("Why does my portfolio look the way it does?")}
                className="mt-3 inline-block text-xs font-semibold uppercase tracking-widest text-zinc-900 underline hover:text-zinc-500">
            Open the full Advisor <span className="eq-arrow">→</span>
          </Link>
        )}
      </div>
      <Reasons report={result.report} />
    </div>
  );
}

function MethodTab({ result }: { result: PortfolioResult }) {
  const built = methodV2Of(result.report);
  return (
    <>
      {built && <MethodV2Card method={built} weights={result.report.allocation.map((row) => row.weight)} />}
      {result.goal && result.report.goal && <GoalMethod report={result.report.goal} goal={result.goal} chosenNote={chosenNote(built)} />}
    </>
  );
}

function Summary({ result, live }: { result: PortfolioResult; live: boolean }) {
  const r = result.report;
  const notes: { key: string; node: ReactNode }[] = [
    ...(!result.approved && live ? [{
      key: "ask",
      node: (
        <Link href={askHref("Why was my portfolio not approved, and what can I change?")}
              className="block border-l-4 border-red-600 px-4 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-red-50">
          Why was it not approved? Ask the Advisor <span className="eq-arrow">→</span>
        </Link>
      ),
    }] : []),
    ...bannerBlocks(result),
    ...(result.report_id ? [{
      key: "saved",
      node: (
        <p className="border-l-4 border-zinc-200 pl-4 text-sm leading-relaxed text-zinc-700">
          Saved to your account for up to 180 days. Open or delete it any time under{" "}
          <Link href="/account" className="underline">Account</Link>.
        </p>
      ),
    }] : []),
    ...(result.trading_history ? [{ key: "trading-history", node: <TradingHistoryNote history={result.trading_history} /> }] : []),
    ...(!result.goal && result.goal_unavailable ? [{
      key: "goal",
      node: <p className="border-l-4 border-zinc-900 pl-4 text-sm leading-relaxed text-zinc-700">{result.goal_unavailable}</p>,
    }] : []),
    {
      key: "pretend",
      node: (
        <p className="text-xs leading-relaxed text-zinc-400">
          Built from the numbers you entered as if they were real. Read it the way you would read a real proposal,
          but it is a prototype&apos;s illustration, not financial advice, and nothing will be bought.
        </p>
      ),
    },
  ];

  return (
    <Panel aside={<Paged items={notes} itemKey={(n) => n.key} noun="notes" listClassName="flex flex-col gap-3" render={(n) => n.node} />}>
      <div className={`mb-6 grid shrink-0 gap-3 ${r.goal ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}>
        {r.goal && <Card label="Goal Chance" value={r.goal.chance} note="Simulated, hypothetical" />}
        <Card label="In Stocks" value={pct(r.equity_weight)} note="Share of the portfolio" />
        <Card label="Volatility" value={pct(r.ex_ante_vol, 1)} note="Typical yearly ups and downs" />
        <Card label="Worst Case" value={pct(r.worst_loss)} note="Harshest hypothetical scenario" />
      </div>
      <div className="mb-6 shrink-0"><AssetMix report={r} /></div>
      <div className="flex min-h-0 flex-col gap-3 border-l-4 border-zinc-900 pl-5">
        <p className="text-sm leading-relaxed text-zinc-900">{r.headline}</p>
        {result.game_note && <p className="text-sm leading-relaxed text-zinc-600">{result.game_note}</p>}
      </div>
    </Panel>
  );
}

/** The IBKR history Agent B used: how much of it, and what could not be priced or matched. */
function TradingHistoryNote({ history: h }: { history: TradingHistorySummary }) {
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="border-l-4 border-zinc-200 pl-4">
      <p className="text-sm leading-relaxed text-zinc-700">
        Based on your uploaded IBKR trading history: {h.n_trades} {h.n_trades === 1 ? "trade" : "trades"},{" "}
        {day(h.start)} to {day(h.end)} ({h.currency}). It can only make your limits more careful.
      </p>
      {h.notes.map((note, i) => <p key={i} className="mt-1 text-xs leading-relaxed text-zinc-500">· {note}</p>)}
    </div>
  );
}

function DataTab({ result }: { result: PortfolioResult }) {
  const synthetic = result.data_source === "synthetic";
  const notes = [...(result.report.goal?.disclosures ?? []), ...result.report.disclosures];
  const parts: { id: string; title: string; body: ReactNode }[] = [
    {
      id: "market", title: "Market data used",
      body: result.universe
        ? <UniverseNote universe={result.universe} synthetic={synthetic} />
        : <p className="text-sm text-zinc-500">{priceLine(result)}.</p>,
    },
    ...(result.goal ? [{ id: "history", title: "Price history behind the goal simulation", body: <GoalHistoryNotes goal={result.goal} /> }] : []),
    ...(notes.length > 0 ? [{ id: "notes", title: "Important information", body: <Disclosures report={result.report} /> }] : []),
  ];
  const [open, setOpen] = useState<string | null>(parts[0]?.id ?? null);
  // One section open at a time: it takes the space left, so its lists page instead of scrolling.
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t-2 border-zinc-900">
      {parts.map((part) => {
        const isOpen = open === part.id;
        return (
          <section key={part.id} className={`flex flex-col border-b-2 border-zinc-100 ${isOpen ? "min-h-0 flex-1" : "shrink-0"}`}>
            <h3 className="shrink-0">
              <button type="button" aria-expanded={isOpen} aria-controls={`data-${part.id}`}
                      onClick={() => setOpen(isOpen ? null : part.id)}
                      className="flex w-full items-center justify-between gap-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-zinc-900 transition-colors hover:text-zinc-500">
                {part.title}
                <span aria-hidden="true" className={`text-sm transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}>▾</span>
              </button>
            </h3>
            {isOpen && (
              <div id={`data-${part.id}`} className="eq-enter flex min-h-40 flex-1 flex-col pb-4">{part.body}</div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function UniverseNote({ universe: u, synthetic }: { universe: Universe; synthetic: boolean }) {
  const replaced = Object.entries(u.replaced);
  const missing = u.n_not_fetched ?? u.not_fetched.length;
  return (
    <div className="shrink-0">
      <p className="text-sm leading-relaxed text-zinc-900">
        {u.instruments.length} investments priced for your interests ({u.interest_areas.map(label).join(", ")}):{" "}
        {synthetic ? "synthetic demo prices." : `${u.from_cache} from saved prices, ${u.new_requests} newly fetched.`}
      </p>
      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-500" title={u.instruments.map((i) => i.ticker).join(" · ")}>
        {u.instruments.map((i) => i.ticker).join(" · ")}
      </p>
      {replaced.length > 0 && (
        <p className="mt-2 line-clamp-2 text-xs text-zinc-500">
          {replaced.map(([from, to]) => `${to} used instead of ${from} (same market; ${from} could not be priced)`).join(". ")}
        </p>
      )}
      {missing > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          {missing} more allowed investments in your chosen categories were not priced this time (data limit, or not
          on our price source). Rebuilding later can include more, because prices already fetched are saved.
        </p>
      )}
    </div>
  );
}

function Card({ label: text, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-2 border-zinc-200 p-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{text}</p>
      <p className={`mb-1 font-heading leading-none text-zinc-900 ${value.length > 6 ? "text-xl" : "text-4xl"}`}>{value}</p>
      <p className="text-xs text-zinc-400">{note}</p>
    </div>
  );
}
