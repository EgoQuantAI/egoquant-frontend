"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdvisorPanel } from "@/components/advisor-panel";
import { Busy } from "@/components/build-status";
import { ReportSections } from "@/components/report-sections";
import { SealControl } from "@/components/seal-control";
import { Sidebar } from "@/components/sidebar";
import { Loader, Skeleton } from "@/components/ui/loader";
import { ratingLine, useSavedFinal } from "@/components/use-saved-final";
import { api, detail, when } from "@/lib/account-api";
import { markReportViewed } from "@/lib/anchoring";
import { basisSentence } from "@/lib/category";
import { type PortfolioResult, type Session, priceLine, useSession } from "@/lib/egoquant";

// One saved report, read-only, exactly as it was built (the backend stored the numbers; nothing is recomputed). The
// sections are the Portfolio page's own (report-sections.tsx), in the same order. Its news is always the FINISHED
// version: if the saved copy still has the quick one, the news rating runs here first, inside the News tab
// (use-saved-final.ts), while every other tab is ready. The download is the backend's page with the finished news and
// the Seal section. The Advisor sits beside it as on the Portfolio page: for this browser's latest build with that build's
// own chat, for any other saved report with facts the backend re-seals from the saved row (GET .../contexts, sealed as of
// the build, so a report older than the chat's 14 days is rebuilt, not discussed) and a conversation of its own. What-If
// works too: the build's What-If facts are kept with the report and re-sealed the same way. A report saved before that
// has none, and the Advisor says it cannot simulate.

type Saved = { id: string; created_at: string; report: PortfolioResult };
type Contexts = { chat_context: string | null; what_if_context: string | null; answers: Session["answers"] | null; expired: boolean };

const quiet = "text-xs font-semibold uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-900";

/** "12 Oct" (the news period, shown beside the price date). */
function shortDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** A report saved before its news rating had finished gets the finished news when it is first opened (useSavedFinal),
 *  so its news window can end after the save. Then the header says so instead of implying the news is as saved. */
function refreshedAfterSave(periodEnd: string, savedAt: string): boolean {
  const end = new Date(periodEnd).getTime(), at = new Date(savedAt).getTime();
  return Number.isFinite(end) && Number.isFinite(at) && end - at > 60 * 60 * 1000;
}

export function SavedReport({ id }: { id: string }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [sealed, setSealed] = useState(false);                 // the plain download is then labelled "not sealed"
  const [error, setError] = useState("");
  const [contexts, setContexts] = useState<Contexts | "failed" | null>(null);
  const session = useSession();
  // The saved row has no id inside (and no download page): the id is the row's, the page is the backend's.
  const initial = useMemo(() => (saved ? { ...saved.report, report_id: id } : null), [saved, id]);
  const finished = useSavedFinal(saved ? id : null, initial, true);

  useEffect(() => {
    let alive = true;
    api(`/api/account/reports/${encodeURIComponent(id)}`).then(({ status, data }) => {
      if (!alive) return;
      if (status === 200 && data.report && typeof data.report === "object") {
        setSaved(data as unknown as Saved);
        void markReportViewed(id);               // logs "report viewed" once per report, and only when sealing is on
      }
      else if (status === 401) setError("Please log in on the Account page to see your saved reports.");
      else if (status === 404) setError("That report was not found. It may have been deleted, or it is older than 180 days.");
      else setError(detail(data, "Could not load the report. Try again in a minute."));
    });
    return () => { alive = false; };
  }, [id]);

  const result = finished.result ? { ...finished.result, report_id: id } : initial;
  const live = session?.result?.report_id === id && session.answers ? session : undefined;   // built in this browser

  useEffect(() => {                                   // the Advisor's facts for a report that is not the live build
    if (!saved || live) return;
    let alive = true;
    api(`/api/account/reports/${encodeURIComponent(id)}/contexts`).then(({ status, data }) => {
      if (!alive) return;
      setContexts(status === 200 ? {
        chat_context: typeof data.chat_context === "string" ? data.chat_context : null,
        what_if_context: typeof data.what_if_context === "string" ? data.what_if_context : null,
        answers: data.answers && typeof data.answers === "object" ? (data.answers as Session["answers"]) : null,
        expired: data.expired === true,
      } : "failed");
    });
    return () => { alive = false; };
  }, [saved, live, id]);
  const news = result?.report.market_briefing;

  return (
    <main className="flex min-h-screen bg-white md:h-screen md:overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b-2 border-zinc-900 py-4 pl-4 pr-20 md:px-12">
          <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">Account · Saved report</h1>
          <Link href="/account" className={quiet}>← Back to account</Link>
        </div>

        <div className="min-h-0 flex-1 md:overflow-hidden">
          {error ? (
            <div className="eq-fade flex max-w-2xl flex-col gap-6 px-4 py-10 md:px-12">
              <p role="alert" className="border-l-4 border-red-600 pl-4 text-sm leading-relaxed text-zinc-900">{error}</p>
              <Link href="/account" className="self-start border-2 border-zinc-900 bg-zinc-900 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900">
                Your saved reports <span className="eq-arrow">→</span>
              </Link>
            </div>
          ) : !saved || !result ? (
            <ReportSkeleton />
          ) : (
            <div className="eq-fade grid min-h-0 grid-cols-1 md:h-full md:grid-cols-[7fr_3fr]">
              <section className="flex min-h-0 min-w-0 flex-col px-4 pt-7 pb-5 md:px-10 [@media(max-height:800px)]:pt-4 [@media(max-height:800px)]:pb-3">
                <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-8 gap-y-4">
                  <div className="min-w-0">
                    <div className="eq-rise flex items-baseline gap-3">
                      <p className={`font-heading text-5xl leading-none [@media(max-height:800px)]:text-4xl ${result.approved ? "text-zinc-900" : "text-red-700"}`}>
                        {result.approved ? "Approved" : "Rejected"}
                      </p>
                      <p className="font-heading text-xl text-zinc-400">{result.c_level}</p>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-500 [@media(max-height:800px)]:mt-1 [@media(max-height:800px)]:line-clamp-1">
                      Saved {when(saved.created_at)} · {priceLine(result)}
                      {news && (refreshedAfterSave(news.period_end, saved.created_at)
                        ? ` · news refreshed ${shortDay(news.period_start)}–${shortDay(news.period_end)} when opened`
                        : ` · news ${shortDay(news.period_start)}–${shortDay(news.period_end)}`)}
                      {" · "}The report as it was built; nothing here is recalculated.
                    </p>
                    {/* only a report built with a Risk Game carries the engine's sentence on how the category was set */}
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">{basisSentence(result.report) ?? "Risk Game: not played or skipped, so this category rests on the questionnaire alone."}</p>
                  </div>
                  <div className="flex max-w-full flex-wrap items-center gap-x-6 gap-y-3">
                    {finished.phase === "final" ? (
                      <a href={`/api/account/reports/${encodeURIComponent(id)}/download${finished.job ? `?job=${encodeURIComponent(finished.job)}` : ""}`}
                         download className={quiet}
                         title={sealed ? "The report without its seal. To prove it was not changed, use Download sealed report." : undefined}>
                        {sealed ? "Download report (not sealed)" : "Download report"}
                      </a>
                    ) : finished.phase === "rating" || finished.phase === "loading" ? (
                      <span className="text-xs text-zinc-500" title="The download is ready when the news rating finishes">
                        <Busy label={ratingLine(finished).replace("…", "")} />
                      </span>
                    ) : (
                      <span className="max-w-sm text-xs text-zinc-500">{finished.reason}</span>
                    )}
                    <SealControl reportId={id} approved={result.approved} ready={finished} onSealed={setSealed} />
                  </div>
                </div>

                <ReportSections result={result} amount={result.report.reference_amount} job={finished.news} session={session} live={!!live} />
              </section>

              {live?.result ? (
                <AdvisorPanel session={live} result={live.result} />
              ) : contexts === null ? (
                <aside aria-label="Ask the Advisor" className="flex min-h-0 flex-col gap-4 border-t-2 border-zinc-900 bg-zinc-50 px-4 pt-6 pb-6 md:border-l-2 md:border-t-0 md:px-7 md:pt-7">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-3 w-full" />
                  <Loader size="sm" label="Preparing the Advisor for this report" />
                </aside>
              ) : contexts !== "failed" && contexts.chat_context ? (
                <AdvisorPanel key={id} chatKey={`egoquant.advisor.chat.v1.report.${id}`} fullChat={false}
                              session={{ ...(session ?? {}), answers: contexts.answers ?? session?.answers } as Session}
                              result={{ ...result, chat_context: contexts.chat_context, what_if_context: contexts.what_if_context }} />
              ) : (
                <aside aria-label="Ask the Advisor" className="flex min-h-0 flex-col border-t-2 border-zinc-900 bg-zinc-50 px-4 pt-6 pb-7 md:border-l-2 md:border-t-0 md:px-7 md:pt-7">
                  <p className="font-heading text-3xl leading-none text-zinc-900">Ask the Advisor</p>
                  <p className="mt-4 text-sm leading-relaxed text-zinc-700">
                    {contexts !== "failed" && contexts.expired
                      ? "This report is older than 14 days, so the Advisor no longer discusses it. Build a fresh one with today's prices to ask about it."
                      : "The Advisor could not be prepared for this report right now. Try again in a minute, or build a fresh report."}
                  </p>
                  <Link href="/portfolio" className="mt-5 self-start border-2 border-zinc-900 bg-zinc-900 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900">
                    Go to Portfolio <span className="eq-arrow">→</span>
                  </Link>
                </aside>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/** The report's shape while it arrives: verdict, actions, section tabs and the first section. */
function ReportSkeleton() {
  return (
    <div role="status" aria-label="Loading the report" className="flex h-full min-h-0 flex-col px-4 pt-7 pb-5 md:px-10">
      <Skeleton className="h-12 w-56" />
      <Skeleton className="mt-3 h-3 w-full max-w-lg" />
      <div className="mt-8 flex gap-4 border-b-2 border-zinc-100 pb-2.5">
        {["w-16", "w-14", "w-20", "w-12", "w-20", "w-14"].map((w, i) => <Skeleton key={i} className={`h-3 ${w}`} />)}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="mt-6 h-3 w-full" />
      <Skeleton className="mt-6 h-20 w-full max-w-2xl" />
    </div>
  );
}
