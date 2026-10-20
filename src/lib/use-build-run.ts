"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BUILD_SLOW_AFTER_S } from "@/lib/build-timing";

/** One portfolio build in progress: whether it runs, for how long, and how it ended. Used by every place that builds. */
export type BuildRun = {
  pending: boolean;
  seconds: number;                 // since this attempt started
  slow: boolean;                   // running longer than BUILD_SLOW_AFTER_S
  error: string;
  setError: (message: string) => void;
  /** Start `task`; it gets a signal that is aborted when the run is retried or the page is left. Ignored while one runs. */
  start: (task: (signal: AbortSignal) => Promise<void>, fallback: string) => void;
  /** Cancel the running attempt and start the same task again. */
  retry: () => void;
};

export function useBuildRun(): BuildRun {
  const [pending, setPending] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const attempt = useRef(0);                       // which attempt may still change the state
  const controller = useRef<AbortController | null>(null);
  const last = useRef<{ task: (signal: AbortSignal) => Promise<void>; fallback: string } | null>(null);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTicker = () => {
    if (ticker.current) clearInterval(ticker.current);
    ticker.current = null;
  };

  const launch = useCallback((task: (signal: AbortSignal) => Promise<void>, fallback: string) => {
    const mine = ++attempt.current;
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    last.current = { task, fallback };
    const began = Date.now();
    stopTicker();
    setPending(true);
    setError("");
    setSeconds(0);
    ticker.current = setInterval(() => setSeconds(Math.floor((Date.now() - began) / 1000)), 1000);
    task(abort.signal)
      .catch((cause: unknown) => {
        if (attempt.current === mine) setError(cause instanceof Error ? cause.message : fallback);
      })
      .finally(() => {
        if (attempt.current !== mine) return;      // a newer attempt owns the state now
        stopTicker();
        setPending(false);
      });
  }, []);

  const start = useCallback((task: (signal: AbortSignal) => Promise<void>, fallback: string) => {
    if (ticker.current) return;                    // one at a time (the ticker runs exactly while a build does)
    launch(task, fallback);
  }, [launch]);

  const retry = useCallback(() => {
    if (last.current) launch(last.current.task, last.current.fallback);
  }, [launch]);

  useEffect(() => () => {
    attempt.current += 1;                          // leaving the page: nothing may set state any more
    controller.current?.abort();
    stopTicker();
  }, []);

  return { pending, seconds, slow: pending && seconds >= BUILD_SLOW_AFTER_S, error, setError, start, retry };
}
