"use client";

import { useEffect, useRef, useState } from "react";
import { type BriefingJob, useBriefingJob } from "@/components/use-briefing-job";
import { type PortfolioResult, newsIsFinal } from "@/lib/egoquant";

// A SAVED report with its finished news, whatever way it is reached (Account → Build and save, Open, Download).
// If the saved copy still has the quick in-request news, the briefing job runs (the same one as on the Portfolio
// page: "Rating news… N of M"), and its final news goes into the saved report (POST .../briefing, which needs
// migration 004 in the database). If that save fails, the finished report is still built for this screen and its
// download (POST /api/briefing/<job>/report); the saved copy then keeps its first version, and it cannot be sealed.
// A copy saved WITHOUT news (the briefing was too large to store) still gets the job, for the News tab and the download
// only: nothing is saved into it, so its seal is unaffected. `news` is the job itself, for the News tab's progress.

const AGENT_D_KEYS = ["market_briefing", "market_briefing_month", "what_changed", "what_changed_action",
                      "what_changed_month", "what_changed_month_action"];

export type SavedFinal = {
  /** final: the news is finished (saved: also in the saved report) · rating: the job is running · failed: it is not */
  phase: "loading" | "rating" | "final" | "failed";
  rated: number;
  total: number;
  /** The report to show and download: the saved one, or the finished version built from the job. */
  result: PortfolioResult | null;
  /** The saved report itself holds the finished news (only then can it be sealed). */
  saved: boolean;
  /** The finished briefing job, for the download (the backend checks it belongs to this report). */
  job?: string;
  /** Plain words for a news section that could not be finished. */
  reason?: string;
  /** The briefing job (phase "none" when the saved news is already finished), for the News tab. */
  news?: BriefingJob;
};

async function getSaved(reportId: string): Promise<PortfolioResult | null> {
  const r = await fetch(`/api/account/reports/${encodeURIComponent(reportId)}`, { cache: "no-store" });
  if (!r.ok) return null;
  const data = (await r.json()) as { report?: PortfolioResult };
  return data.report && typeof data.report === "object" ? data.report : null;
}

/** `initial`: the saved report if the caller already has it (else it is fetched). `forView`: the caller shows the news
 *  (the saved report page), so a copy saved without news runs the job too; the Account list only needs the seal. */
export function useSavedFinal(reportId: string | null, initial?: PortfolioResult | null, forView = false): SavedFinal {
  const [fetched, setSaved] = useState<PortfolioResult | null>(null);
  const saved = initial ?? fetched;
  const [built, setBuilt] = useState<{ job: string; result: PortfolioResult; inAccount: boolean } | null>(null);
  const [failed, setFailed] = useState("");
  const handled = useRef<string | null>(null);

  useEffect(() => {                                   // the saved copy (unless the caller passed it)
    if (!reportId || initial) return;
    let alive = true;
    getSaved(reportId).then((r) => { if (alive) setSaved(r); });
    return () => { alive = false; };
  }, [reportId, initial]);

  const withoutNews = !!saved && !saved.report.market_briefing;
  const needsJob = !!saved && !!saved.briefing_context && (withoutNews ? forView : !newsIsFinal(saved.report));
  const job = useBriefingJob(needsJob ? saved!.briefing_context : null);

  useEffect(() => {                                   // the job finished: save its final news, else build it in memory
    if (!reportId || !saved || withoutNews || job.phase !== "done" || !job.id || handled.current === job.id) return;
    handled.current = job.id;
    const jobId = job.id;
    (async () => {
      try {
        const store = await fetch(`/api/account/reports/${encodeURIComponent(reportId)}/briefing`, {
          method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
          body: JSON.stringify({ job: jobId }),
        });
        if (store.ok) {
          const fresh = await getSaved(reportId);
          if (fresh?.report.market_briefing && newsIsFinal(fresh.report)) {
            setBuilt({ job: jobId, result: fresh, inAccount: true });
            return;
          }
        }
        const report = Object.fromEntries(Object.entries(saved.report).filter(([k]) => !AGENT_D_KEYS.includes(k)));
        const r = await fetch(`/api/briefing/${encodeURIComponent(jobId)}/report`, {
          method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
          body: JSON.stringify({ report, chat_context: null }),
        });
        if (!r.ok) throw new Error(String(r.status));
        const final = (await r.json()) as { report: PortfolioResult["report"]; html: string };
        setBuilt({ job: jobId, result: { ...saved, report: final.report, html: final.html }, inAccount: false });
      } catch {
        setFailed(jobId);
      }
    })();
  }, [reportId, saved, withoutNews, job.phase, job.id]);

  if (!reportId) return { phase: "failed", rated: 0, total: 0, result: null, saved: false };
  if (!saved) return { phase: "loading", rated: 0, total: 0, result: null, saved: false };
  if (withoutNews) {
    return { phase: "final", rated: 0, total: 0, result: saved, saved: true, news: job,
             job: job.phase === "done" ? job.id : undefined };
  }
  if (newsIsFinal(saved.report)) return { phase: "final", rated: 0, total: 0, result: saved, saved: true };
  if (!saved.briefing_context) {
    return { phase: "failed", rated: 0, total: 0, result: saved, saved: false,
             reason: "This report was saved before its news could be finished. Build a new report to get the rated news." };
  }
  if (built && built.job === job.id) {
    return { phase: "final", rated: job.rated, total: job.total, result: built.result, saved: built.inAccount, job: built.job, news: job };
  }
  if (job.phase === "failed" || (job.id && failed === job.id)) {
    return { phase: "failed", rated: job.rated, total: job.total, result: saved, saved: false, news: job,
             reason: "The news rating could not be finished right now. Open the report again in a minute." };
  }
  return { phase: "rating", rated: job.rated, total: job.total, result: saved, saved: false, news: job };
}

/** "Rating news… 12 of 40" (or without numbers while the job is still collecting headlines). */
export function ratingLine(f: Pick<SavedFinal, "rated" | "total">): string {
  return f.total > 0 ? `Rating news… ${f.rated} of ${f.total}` : "Rating news…";
}
