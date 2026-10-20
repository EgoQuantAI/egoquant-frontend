"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SealControl } from "@/components/seal-control";
import { ratingLine, useSavedFinal } from "@/components/use-saved-final";
import { api, detail, when } from "@/lib/account-api";
import { useAnchoringStatus } from "@/lib/anchoring";
import { shortDay } from "@/lib/dates";
import { BuildStatus, Busy } from "@/components/build-status";
import { Loader } from "@/components/ui/loader";
import { Pager } from "@/components/ui/pager";
import { buildPortfolio, pct, useSession } from "@/lib/egoquant";
import { useBuildRun } from "@/lib/use-build-run";

// The signed-in user's saved reports (account page): build a new one from the saved IBKR history, open one,
// delete one. The list shows the backend's own summary line of each report; nothing is recomputed here.

type Row = {
  id: string;
  created_at: string;
  summary: {
    approved?: boolean; as_of?: string; prices_as_of?: string; data_source?: string; equity_weight?: number | null; n_trades?: number; prob_goal?: number | null;
  };
};

const primary =
  "border-2 border-zinc-900 bg-zinc-900 px-6 py-2.5 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-default disabled:opacity-50";
/** The simulation's own error is about one percentage point, so the extremes are not shown as 0% or 100%. */
const chance = (p: number) => (p >= 0.995 ? "more than 99%" : p < 0.005 ? "less than 1%" : pct(p));
const label = "text-[10px] font-semibold uppercase tracking-widest text-zinc-400";
const PAGE = 5;

export function AccountReports({ onChanged, onGone }: { onChanged: () => Promise<void>; onGone: (message: string) => void }) {
  const session = useSession();
  const anchoring = useAnchoringStatus();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  const run = useBuildRun();
  const building = run.pending;
  const [confirmId, setConfirmId] = useState("");
  const [deleting, setDeleting] = useState("");
  const [built, setBuilt] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const load = useCallback(async () => {
    const { status, data } = await api("/api/account/reports");
    if (status === 200 && Array.isArray(data.reports)) setRows(data.reports as Row[]);
    else if (status === 401) onGone("You were signed out. Please log in again.");
    else setError(detail(data, "Could not load your reports."));
  }, [onGone]);

  useEffect(() => {
    let alive = true;
    api("/api/account/reports").then(({ status, data }) => {
      if (!alive) return;
      if (status === 200 && Array.isArray(data.reports)) setRows(data.reports as Row[]);
      else if (status === 401) onGone("You were signed out. Please log in again.");
      else setError(detail(data, "Could not load your reports."));
    });
    return () => { alive = false; };
  }, [onGone]);

  const ready = !!(session?.answers && session.profile && session.intake);

  function build() {
    if (!session?.answers || !session.profile || !session.intake || building) return;
    const { answers, intake, riskGame } = session;
    setError("");
    setBuilt(null);
    run.start(async (signal) => {
      const result = await buildPortfolio(answers, intake, riskGame, "account", signal);
      setBuilt(result.report_id ?? null);
      setPage(0);
      await load();
      await onChanged();
    }, "Could not build the report.");
  }

  async function remove(id: string) {
    if (deleting) return;
    setDeleting(id);
    setError("");
    const { status, data } = await api(`/api/account/reports/${id}`, { method: "DELETE" });
    setDeleting("");
    setConfirmId("");
    if (status === 200 || status === 404) {
      await load();
      await onChanged();
    } else if (status === 401) {
      onGone("You were signed out. Please log in again.");
    } else {
      setError(detail(data, "Could not delete that report."));
    }
  }

  const pages = rows ? Math.ceil(rows.length / PAGE) : 0;
  const current = Math.min(page, Math.max(0, pages - 1));     // after a delete on the last page

  return (
    <div>
      <p className={label}>Saved reports</p>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600">
        {ready
          ? "Build a report from your profile, your investments and the IBKR data saved here (if any). It is kept in your account for up to 180 days."
          : "Complete your profile and choose your investments first; then you can build a report here that is kept in your account."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        {ready ? (
          <button type="button" onClick={build} disabled={building} className={primary}>
            {building ? <Busy label="Building" /> : "Build and save a report"}
          </button>
        ) : (
          <Link href="/questionnaire" className={primary}>Start the profile</Link>
        )}
        {built && <BuiltNote reportId={built} />}
      </div>
      <BuildStatus run={run} className="mt-3 text-sm" />
      {error && !run.error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

      {rows === null && !error && <Loader className="mt-4" label="Loading your reports" />}
      {rows !== null && rows.length === 0 && <p className="mt-4 text-sm text-zinc-500">No saved reports yet.</p>}
      {rows !== null && rows.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {rows.slice(current * PAGE, (current + 1) * PAGE).map((row, i) => {
            const index = current * PAGE + i;
            const s = row.summary ?? {};
            return (
              <li key={row.id} className="border-2 border-zinc-200 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm text-zinc-900">
                    <span className={`font-semibold ${s.approved === false ? "text-red-700" : ""}`}>
                      {s.approved === false ? "Rejected" : "Approved"}
                    </span>
                    <span className="ml-2 text-xs text-zinc-400">{when(row.created_at)}</span>
                  </p>
                  <div className="flex shrink-0 items-center gap-4">
                    <Link href={`/account/reports/${row.id}`}
                          className="eq-tap text-xs font-semibold uppercase tracking-widest text-zinc-900 underline">Open</Link>
                    {confirmId === row.id ? (
                      <>
                        <button type="button" onClick={() => remove(row.id)} disabled={!!deleting}
                                className="eq-tap text-xs font-semibold uppercase tracking-widest text-red-700 hover:underline">
                          {deleting === row.id ? <Busy label="Deleting" /> : "Yes, delete"}
                        </button>
                        <button type="button" onClick={() => setConfirmId("")}
                                className="eq-tap text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">No</button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmId(row.id)} disabled={!!deleting}
                              className="eq-tap text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-red-700">Delete</button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {typeof s.equity_weight === "number" ? `${pct(s.equity_weight)} in stocks` : "–"}
                  {typeof s.prob_goal === "number" ? ` · goal chance ${chance(s.prob_goal)}` : ""}
                  {s.n_trades ? ` · built with ${s.n_trades} IBKR trades` : ""}
                  {s.data_source === "synthetic" ? " · demo data" : ""}
                  {/* a saved snapshot is older than the day the report was made (as_of): do not call that the price day */}
                  {s.prices_as_of ? ` · prices to ${shortDay(s.prices_as_of)} ${s.prices_as_of.slice(0, 4)}`
                    : s.data_source === "historical" ? " · saved real prices, not live" : s.as_of ? ` · prices as of ${s.as_of}` : ""}
                </p>
                {/* The seal: only when sealing is on. Not sealed · Confirm and seal (the news is finished first), or its state. */}
                {anchoring && index < 10 && (
                  <div className="mt-2"><SealControl reportId={row.id} approved={s.approved !== false} /></div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {rows !== null && rows.length > PAGE && (
        <Pager page={current} pages={pages} onPage={setPage} />
      )}
    </div>
  );
}

/** Right after "Build and save": the saved report's news is finished here too (the same rating as the Portfolio
 *  page), so the saved copy, its Open view and its download all carry the finished news. */
function BuiltNote({ reportId }: { reportId: string }) {
  const f = useSavedFinal(reportId);
  const links = (
    <>
      <Link href={`/account/reports/${reportId}`} className="underline">Open it</Link> or{" "}
      <Link href="/portfolio" className="underline">see it in the portfolio</Link>.
    </>
  );
  if (f.phase === "loading" || f.phase === "rating") {
    return <span role="status" className="text-sm font-semibold text-zinc-900">Saved. {ratingLine(f)}</span>;
  }
  if (f.phase === "final") {
    return (
      <span role="status" className="text-sm font-semibold text-zinc-900">
        Saved with the rated news{f.saved ? "" : " (shown when you open it)"}. {links}
      </span>
    );
  }
  return <span role="status" className="text-sm font-semibold text-zinc-900">Saved. {f.reason} {links}</span>;
}
