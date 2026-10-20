"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, when } from "@/lib/account-api";
import { useAnchoringStatus } from "@/lib/anchoring";

// "My seals": every report this account confirmed, with its block and transaction, so a document someone shows you can
// be compared with your own seals (same transaction = your report). Only when sealing is on.

type Seal = { report_id: string; confirmed_at: string | null; status: string; tx_hash: string | null;
              block_number: number | null; block_time: string | null; explorer_url: string | null };
const label = "text-[10px] font-semibold uppercase tracking-widest text-zinc-400";

export function MySeals() {
  const anchoring = useAnchoringStatus();
  const [seals, setSeals] = useState<Seal[] | null>(null);

  useEffect(() => {
    if (!anchoring) return;
    let alive = true;
    api("/api/account/seals").then(({ status, data }) => {
      if (alive) setSeals(status === 200 && Array.isArray(data.seals) ? (data.seals as Seal[]) : []);
    });
    return () => { alive = false; };
  }, [anchoring]);

  if (!anchoring) return null;
  return (
    <div className="mt-8">
      <p className={label}>My seals</p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600">
        Every plan you confirmed, with its public transaction. To check whether a sealed report is one of yours, compare its
        transaction with this list.
      </p>
      {seals === null ? (
        <p className="mt-3 animate-pulse text-sm text-zinc-400">Loading…</p>
      ) : seals.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No sealed reports yet.</p>
      ) : (
        <table className="mt-3 w-full text-left text-xs text-zinc-700">
          <thead className={label}>
            <tr><th className="py-1 pr-3 font-semibold">Confirmed</th><th className="py-1 pr-3 font-semibold">Report</th>
                <th className="py-1 pr-3 font-semibold">Block</th><th className="py-1 font-semibold">Transaction</th></tr>
          </thead>
          <tbody>
            {seals.map((s) => (
              <tr key={s.report_id} className="border-t border-zinc-200">
                <td className="py-1.5 pr-3">{s.confirmed_at ? when(s.confirmed_at) : "–"}</td>
                <td className="py-1.5 pr-3"><Link href={`/account/reports/${s.report_id}`} className="underline">{s.report_id.slice(0, 8)}</Link></td>
                <td className="py-1.5 pr-3">{s.block_number != null ? s.block_number.toLocaleString("en-US") : s.status === "submitted" ? "waiting" : "pending"}</td>
                <td className="py-1.5 font-mono">
                  {s.tx_hash && s.explorer_url
                    ? <a href={s.explorer_url} target="_blank" rel="noopener noreferrer" className="underline">{s.tx_hash.slice(0, 10)}…{s.tx_hash.slice(-6)} ↗</a>
                    : "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
