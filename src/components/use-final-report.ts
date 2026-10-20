"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BriefingJob } from "@/components/use-briefing-job";
import { type PortfolioResult, saveSession } from "@/lib/egoquant";

// One source of truth for Agent D: once the news briefing job is done, the report itself (the HTML download, the
// report tabs, "What changed" and the Advisor's sealed context) takes the job's FINAL briefing, the same one the
// News tab shows. The backend checks that the report's other numbers are exactly the ones /portfolio produced and
// changes nothing else. A signed-in user's saved report is updated the same way, and the hook says whether that
// SAVED report has taken the final version (`saved`): a plan may be sealed only after that (docs/ON_CHAIN_COORDINATION.md
// 2.2), because the seal fingerprints the saved report as it is at that moment.

const AGENT_D_KEYS = ["market_briefing", "market_briefing_month", "what_changed", "what_changed_action",
                      "what_changed_month", "what_changed_month_action"] as const;

type FinalReport = { report: PortfolioResult["report"]; html: string; chat_context: string | null; job: string };

export type FinalState = "waiting" | "final" | "unavailable";

/**
 * Whether the saved account report holds Agent D's final briefing:
 *   none     there is no saved report (a visitor's build, or one built without saving)
 *   waiting  the news is still being rated, or the final version is on its way to the saved report
 *   saved    the saved report took the final briefing (POST /api/account/reports/{id}/briefing answered OK)
 *   ended    the briefing job ended without a usable result: the saved report keeps its first version, and says so
 *   unsaved  the job finished but the saved report could not be updated (see `retrySave`)
 */
export type SavedBriefing = "none" | "waiting" | "saved" | "ended" | "unsaved";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** POST the job to the saved report; true when it took it (or the report was already sealed with it). Retries a little. */
async function saveBriefing(reportId: string, jobId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`/api/account/reports/${encodeURIComponent(reportId)}/briefing`, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ job: jobId }), signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return true;
      if (response.status === 401 || response.status === 404 || response.status === 403) return false;   // retrying cannot help
      if (response.status === 409) {
        const data = (await response.json().catch(() => ({}))) as { detail?: unknown };
        if (typeof data.detail === "string" && /sealed/i.test(data.detail)) return true;   // already confirmed: nothing to save
      }
    } catch {
      // network: try again
    }
    await sleep(1500 * (attempt + 1));
  }
  return false;
}

export function useFinalReport(
  result: PortfolioResult, job: BriefingJob,
): { state: FinalState; saved: SavedBriefing; retrySave: () => void } {
  const [failed, setFailed] = useState<string | null>(null);
  const [save, setSave] = useState<{ job: string; status: "saving" | "saved" | "failed" } | null>(null);
  const started = useRef<string | null>(null);
  const jobId = job.id;
  const reportId = result.report_id;

  const saveToAccount = useCallback(async (id: string, report: string) => {
    setSave({ job: id, status: "saving" });
    setSave({ job: id, status: (await saveBriefing(report, id)) ? "saved" : "failed" });
  }, []);

  useEffect(() => {
    if (job.phase !== "done" || !jobId || started.current === jobId) return;
    started.current = jobId;
    (async () => {
      if (result.agent_d_final !== jobId) {
        const report = Object.fromEntries(
          Object.entries(result.report).filter(([key]) => !(AGENT_D_KEYS as readonly string[]).includes(key)));
        try {
          const response = await fetch(`/api/briefing/${encodeURIComponent(jobId)}/report`, {
            method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
            body: JSON.stringify({ report, chat_context: result.chat_context ?? null }),
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) throw new Error(String(response.status));
          const final = (await response.json()) as FinalReport;
          saveSession({ result: { ...result, report: final.report, html: final.html,
                                  chat_context: final.chat_context ?? result.chat_context, agent_d_final: jobId } });
        } catch {
          setFailed(jobId);             // the report keeps its first version, which says so in plain words
          return;
        }
      }
      if (reportId) await saveToAccount(jobId, reportId);     // the saved account report gets the same final version
    })();
  }, [job.phase, jobId, result, reportId, saveToAccount]);

  const retrySave = useCallback(() => {
    if (jobId && reportId) void saveToAccount(jobId, reportId);
  }, [jobId, reportId, saveToAccount]);

  const state: FinalState = jobId && result.agent_d_final === jobId ? "final"
    : job.phase === "running" || (job.phase === "done" && failed !== jobId) ? "waiting"
    : "unavailable";

  let saved: SavedBriefing;
  if (!reportId) saved = "none";
  else if (job.phase === "running") saved = "waiting";
  else if (job.phase !== "done") saved = "ended";                         // no briefing job, or it failed
  else if (failed === jobId) saved = "ended";                             // the final version could not be built
  else if (save && save.job === jobId && save.status === "saved") saved = "saved";
  else if (save && save.job === jobId && save.status === "failed") saved = "unsaved";
  else saved = "waiting";
  return { state, saved, retrySave };
}
