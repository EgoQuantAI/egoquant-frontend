"use client";

import Link from "next/link";
import { Loader } from "@/components/ui/loader";
import type { BuildRun } from "@/lib/use-build-run";

// What the person reads while a portfolio is being built, and how it ended. The same text on every page that builds.
// Seconds are drawn but hidden from screen readers (a status that changed every second would be read out each time).

export const WORKING = "Building your portfolio can take up to a minute.";
export const SLOW = "Still working, the data source is slow. You can wait or try again with fewer interest areas.";

/** A button's own waiting label ("Building…", "Checking…"): the site's Loader in the button's text colour and size. */
export function Busy({ label }: { label: string }) {
  return <Loader size="sm" label={label} className="gap-2 text-[length:inherit] text-inherit [&_.eq-loader-bar]:bg-current" />;
}

export function BuildStatus({ run, className = "" }: { run: BuildRun; className?: string }) {
  if (run.error) return <p role="alert" className={`text-red-600 ${className}`}>{run.error}</p>;
  if (!run.pending) return null;
  return (
    <div className={`text-zinc-500 ${className}`}>
      <p role="status">
        {WORKING} <span aria-hidden="true" className="tabular-nums text-zinc-400">{run.seconds} s</span>
      </p>
      {run.slow && (
        <p role="status" className="mt-1.5 text-zinc-700">
          {SLOW}{" "}
          <button type="button" onClick={run.retry}
                  className="ml-1 border-2 border-zinc-900 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-900 hover:bg-zinc-900 hover:text-white">
            Retry
          </button>{" "}
          <Link href="/interests" className="ml-2 whitespace-nowrap font-semibold text-zinc-900 underline">Change investments</Link>
        </p>
      )}
    </div>
  );
}
