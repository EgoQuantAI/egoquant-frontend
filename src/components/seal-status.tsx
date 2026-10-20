"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, when } from "@/lib/account-api";
import { type SealInfo, type SealOut, reportPath } from "@/lib/anchoring";

// The seal of a confirmed plan, in words: whether the fingerprint is on the Sepolia test chain yet, where to see the
// transaction, how to download the proof file. Nothing here is shown unless the caller already knows sealing is on
// (see lib/anchoring.ts); a report that was never confirmed, or any error, renders nothing (or the quiet `emptyText`).
// Separate from the on-chain branch's own badge on purpose, so the two merge without touching the same file.

const STATUSES = new Set(["pending", "submitted", "confirmed", "failed"]);
const TX = /^0x[0-9a-f]{64}$/;

function parseSeal(raw: unknown): SealOut | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.status !== "string" || !STATUSES.has(s.status)) return null;
  const text = (v: unknown) => (typeof v === "string" ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const url = text(s.explorer_url);
  return {
    status: s.status as SealOut["status"],
    tx_hash: text(s.tx_hash) && TX.test(text(s.tx_hash)!) ? text(s.tx_hash) : null,
    chain_id: num(s.chain_id),
    block_number: num(s.block_number),
    block_time: text(s.block_time),
    explorer_url: url && /^https:\/\/[^\s]+$/.test(url) ? url : null,      // only a plain https link is ever rendered
    error_kind: text(s.error_kind),
  };
}

/** The seal fields of a /seal or /confirm answer, or null when the answer is not usable. */
export function parseSealInfo(data: Record<string, unknown>): SealInfo | null {
  const commitment = typeof data.commitment === "string" && /^[0-9a-f]{64}$/.test(data.commitment) ? data.commitment : null;
  const confirmedAt = typeof data.confirmed_at === "string" ? data.confirmed_at : null;
  if (!commitment && !confirmedAt && !data.seal) return null;
  return { commitment, confirmed_at: confirmedAt, seal: parseSeal(data.seal) };
}

const WORDS: Record<SealOut["status"], string> = {
  confirmed: "Sealed on the Sepolia test chain",
  submitted: "Confirmed. Sent to the Sepolia test chain, waiting to be included.",
  pending: "Confirmed. The fingerprint will be published to the Sepolia test chain shortly.",
  failed: "Confirmed. The fingerprint could not be published yet; your confirmation is kept.",
};

export const sealHeadline = (seal: SealOut | null): string => (seal ? WORDS[seal.status] : "Confirmed.");

const link = "font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-500";

export function SealView({ reportId, info }: { reportId: string; info: SealInfo }) {
  const seal = info.seal;
  const proof = reportPath(reportId, "proof");
  const done = seal?.status === "confirmed";
  return (
    <div className="border-l-4 border-zinc-900 pl-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <span aria-hidden="true" className={`inline-block h-2 w-2 ${done ? "bg-zinc-900" : "border border-zinc-900"}`} />
        {sealHeadline(seal)}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        {info.confirmed_at && <>Plan confirmed {when(info.confirmed_at)}. </>}
        {done && seal?.block_time && <>On the chain since {when(seal.block_time)}{seal.block_number != null ? `, block ${seal.block_number}` : ""}. </>}
        {info.commitment && <>Fingerprint {info.commitment.slice(0, 12)}…. </>}
        Only this fingerprint is public, never your report.
      </p>
      <p className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        {seal?.explorer_url && (
          <a href={seal.explorer_url} target="_blank" rel="noopener noreferrer" className={link}>View the transaction ↗</a>
        )}
        {proof && <a href={proof} download className={link}>Download proof file</a>}
        <Link href="/verify" className={link}>Verify a proof</Link>
      </p>
    </div>
  );
}

type State = { kind: "idle" | "loading" | "none" | "off" } | { kind: "ok"; info: SealInfo };

/**
 * Looks up the seal of one saved report. `lazy`: wait for a click before asking (a long list must not make dozens of
 * requests at once). `emptyText`: what to say for a report that was not confirmed (nothing by default).
 */
export function SealStatus({ reportId, lazy = false, emptyText }: { reportId: string; lazy?: boolean; emptyText?: string }) {
  const path = reportPath(reportId, "seal");
  const [state, setState] = useState<State>(!path ? { kind: "off" } : lazy ? { kind: "idle" } : { kind: "loading" });

  useEffect(() => {
    if (!path || lazy) return;
    let alive = true;
    api(path).then(({ status, data }) => {
      if (!alive) return;
      const info = status === 200 ? parseSealInfo(data) : null;
      setState(info ? { kind: "ok", info } : status === 404 ? { kind: "none" } : { kind: "off" });
    });
    return () => { alive = false; };
  }, [path, lazy]);

  async function check() {
    if (!path) return;
    setState({ kind: "loading" });
    const { status, data } = await api(path);
    const info = status === 200 ? parseSealInfo(data) : null;
    setState(info ? { kind: "ok", info } : status === 404 ? { kind: "none" } : { kind: "off" });
  }

  if (state.kind === "ok") return <SealView reportId={reportId} info={state.info} />;
  if (state.kind === "idle") {
    return (
      <button type="button" onClick={check}
              className="text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
        Check seal
      </button>
    );
  }
  if (state.kind === "loading") return <p role="status" className="text-xs text-zinc-400">Checking the seal…</p>;
  if (state.kind === "none" && emptyText) return <p className="text-xs text-zinc-400">{emptyText}</p>;
  return null;
}
