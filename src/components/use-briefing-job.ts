"use client";

import { useCallback, useEffect, useState } from "react";
import type { BriefingJobState } from "@/lib/egoquant";

// Agent D's full news briefing is built by a backend job (it rates every headline for every fund, which can take a
// minute): started as soon as the portfolio is shown, polled every 1.5 s, never blocking the rest of the page.
// Without a sealed briefing_context (older backends) nothing starts and the News tab uses the portfolio's own
// briefing.

export type BriefingJob = {
  phase: "none" | "running" | "done" | "failed";
  id?: string;           // the backend job (the report takes its final briefing: use-final-report.ts)
  rated: number;
  total: number;
  stage: string;
  result?: BriefingJobState["result"];
  /** Start a new job (fresh feeds; ratings already made are reused). Absent when there is nothing to refresh. */
  refresh?: () => void;
};

const POLL_MS = 1500;
const GIVE_UP_MS = 4 * 60_000;

export function useBriefingJob(context: string | null | undefined): BriefingJob {
  const [job, setJob] = useState<BriefingJob>({ phase: context ? "running" : "none", rated: 0, total: 0, stage: "collecting news" });
  const [round, setRound] = useState(0);
  const refresh = useCallback(() => {
    setJob({ phase: "running", rated: 0, total: 0, stage: "collecting news" });
    setRound((r) => r + 1);
  }, []);

  useEffect(() => {
    if (!context) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();

    async function call<T>(path: string, init?: RequestInit): Promise<T> {
      const response = await fetch(path, { ...init, cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as T;
    }

    async function poll(id: string) {
      if (stopped) return;
      try {
        const s = await call<BriefingJobState>(`/api/briefing/${encodeURIComponent(id)}`);
        if (stopped) return;
        if (s.state === "done") {
          setJob({ phase: "done", id, rated: s.rated, total: s.total, stage: "done", result: s.result });
          return;
        }
        if (s.state === "failed" || Date.now() - started > GIVE_UP_MS) {
          setJob((j) => ({ ...j, phase: "failed" }));
          return;
        }
        setJob({ phase: "running", id, rated: s.rated, total: s.total, stage: s.stage });
      } catch {
        if (Date.now() - started > GIVE_UP_MS) {
          setJob((j) => ({ ...j, phase: "failed" }));
          return;
        }
      }
      timer = setTimeout(() => poll(id), POLL_MS);
    }

    (async () => {
      try {
        const s = await call<BriefingJobState>("/api/briefing/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ briefing_context: context }),
        });
        if (!stopped) poll(s.job);
      } catch {
        if (!stopped) setJob((j) => ({ ...j, phase: "failed" }));
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [context, round]);

  return context && job.phase !== "running" ? { ...job, refresh } : job;
}
