"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmForm, Dialog } from "@/components/confirm-plan";
import { parseSealInfo } from "@/components/seal-status";
import { Loader } from "@/components/ui/loader";
import { Busy } from "@/components/build-status";
import { type SavedFinal, ratingLine, useSavedFinal } from "@/components/use-saved-final";
import { api } from "@/lib/account-api";
import { type SealInfo, reportPath, useAnchoringStatus } from "@/lib/anchoring";

// The seal of one saved report, the same everywhere (Portfolio page, Account list, saved report):
//   Not sealed · [Confirm and seal]         (an approved report whose saved copy has the FINISHED news)
//   [Waiting for the news rating to finish (N of M)…]   (disabled until then: the seal covers the finished report)
//   Sealing… (waiting for a block)
//   Sealed on Sepolia ✓ · block N · date · View on Etherscan ↗ · Download proof file
// Nothing at all when sealing is off; one line inviting a visitor to sign in. Never an error box.

const button =
  "border-2 border-zinc-900 bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white disabled:cursor-default disabled:border-zinc-300 disabled:text-zinc-400 disabled:hover:bg-white";
const link = "font-semibold text-zinc-900 underline underline-offset-2 hover:text-zinc-500";
const POLL_MS = 5_000;
const BEFORE = "Confirming publishes a fingerprint of this exact report, with your username, on a public test blockchain, so " +
  "anyone can later check it wasn't changed by anyone, including us. Only the fingerprint is public: no personal data, no " +
  "money moves.";
const POLL_FOR_MS = 120_000;

type Known = { kind: "loading" } | { kind: "none" } | { kind: "off" } | { kind: "sealed"; info: SealInfo };

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";

/** `ready`: whether this report's news is finished in the SAVED report (the page knows; the Account list finds out
 *  on click). `signedIn`: false shows the sign-in line instead. */
export function SealControl({ reportId, approved, ready, signedIn = true, onRetrySave, onSealed }: {
  reportId: string | null | undefined;
  approved: boolean;
  ready?: Pick<SavedFinal, "phase" | "rated" | "total" | "saved" | "reason">;
  signedIn?: boolean;
  onRetrySave?: () => void;
  /** Told whether the plan is confirmed (sealed or on its way), so a page can label its plain download. */
  onSealed?: (sealed: boolean) => void;
}) {
  const anchoring = useAnchoringStatus();
  const [known, setKnown] = useState<Known>({ kind: "loading" });
  const [open, setOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);       // Account list: the click started the news rating
  const started = useRef(0);
  const path = reportId ? reportPath(reportId, "seal") : null;

  const look = useCallback(async () => {
    if (!path) return;
    const { status, data } = await api(path, { timeoutMs: 20_000 });
    const info = status === 200 ? parseSealInfo(data) : null;
    setKnown(info ? { kind: "sealed", info } : status === 404 ? { kind: "none" } : { kind: "off" });
  }, [path]);

  useEffect(() => {
    if (!anchoring || !signedIn || !path) return;
    let alive = true;
    api(path, { timeoutMs: 20_000 }).then(({ status, data }) => {
      if (!alive) return;
      const info = status === 200 ? parseSealInfo(data) : null;
      setKnown(info ? { kind: "sealed", info } : status === 404 ? { kind: "none" } : { kind: "off" });
    });
    return () => { alive = false; };
  }, [anchoring, signedIn, path]);

  useEffect(() => { if (known.kind !== "loading") onSealed?.(known.kind === "sealed"); }, [known.kind, onSealed]);

  const waitingForBlock = known.kind === "sealed" && known.info.seal?.status !== "confirmed";
  useEffect(() => {                                      // a seal on its way: ask every 5 s for up to 2 minutes
    if (!waitingForBlock) return;
    if (!started.current) started.current = Date.now();
    if (Date.now() - started.current > POLL_FOR_MS) return;
    const timer = setTimeout(() => { void look(); }, POLL_MS);
    return () => clearTimeout(timer);
  }, [waitingForBlock, known, look]);

  if (!anchoring || !approved) return null;
  if (!signedIn) return <Link href="/account" className="text-xs font-semibold text-zinc-500 underline">Sign in to confirm and seal this plan</Link>;
  if (!reportId || known.kind === "loading" || known.kind === "off") return null;

  if (known.kind === "sealed") return <SealLine reportId={reportId} info={known.info} />;

  const confirmDialog = open && (
    <Dialog title="Confirm this plan" onClose={() => setOpen(false)}>
      <ConfirmForm anchoring={anchoring} reportId={reportId} onClose={() => setOpen(false)}
                   onConfirmed={(info) => { setOpen(false); started.current = Date.now(); setKnown({ kind: "sealed", info }); }} />
    </Dialog>
  );

  // The Account list: finish this report's news first (inline progress), then the same dialog.
  if (!ready) {
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span className="basis-full"><span className="block max-w-md leading-relaxed">{BEFORE}</span></span>
        <span>Not sealed ·</span>
        {finishing
          ? <Finisher reportId={reportId} onReady={() => { setFinishing(false); setOpen(true); }} />
          : <button type="button" className={button} onClick={() => setFinishing(true)}>Confirm and seal</button>}
        {confirmDialog}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
      {!(ready.phase === "final" && !ready.saved) && ready.phase !== "failed" && (
        <span className="basis-full"><span className="block max-w-md leading-relaxed">{BEFORE}</span></span>
      )}
      <ReadyButton ready={ready} onConfirm={() => setOpen(true)} onRetrySave={onRetrySave} />
      {confirmDialog}
    </span>
  );
}

function ReadyButton({ ready, onConfirm, onRetrySave }: {
  ready: Pick<SavedFinal, "phase" | "rated" | "total" | "saved" | "reason">; onConfirm: () => void; onRetrySave?: () => void;
}) {
  if (ready.phase === "final" && ready.saved) {
    return <><span>Not sealed ·</span><button type="button" className={button} onClick={onConfirm}>Confirm and seal</button></>;
  }
  if (ready.phase === "loading" || ready.phase === "rating") {
    return (
      <button type="button" className={button} disabled aria-busy="true">
        <Busy label={`Waiting for the news rating to finish${ready.total > 0 ? ` (${ready.rated} of ${ready.total})` : ""}`} />
      </button>
    );
  }
  if (ready.phase === "final") {                      // finished, but the saved report could not take it (yet)
    return (
      <span>
        The finished news could not be saved to this report yet, so it cannot be sealed.
        {onRetrySave && <> <button type="button" onClick={onRetrySave} className={link}>Try again</button></>}
      </span>
    );
  }
  return <span>{ready.reason ?? "The news rating could not be finished, so this plan cannot be sealed yet."}</span>;
}

/** Account list: runs the news rating for one saved report and calls onReady once the saved copy is final. */
function Finisher({ reportId, onReady }: { reportId: string; onReady: () => void }) {
  const f = useSavedFinal(reportId);
  const done = f.phase === "final" && f.saved;
  const called = useRef(false);
  useEffect(() => {
    if (done && !called.current) { called.current = true; onReady(); }
  }, [done, onReady]);
  if (f.phase === "loading" || f.phase === "rating") return <Loader size="sm" label={ratingLine(f).replace("…", "")} className="text-xs" />;
  if (f.phase === "final" && !f.saved) return <span>The finished news could not be saved to this report yet, so it cannot be sealed.</span>;
  if (f.phase === "failed") return <span>{f.reason}</span>;
  return null;
}

const downloadButton =
  "border-2 border-zinc-900 bg-zinc-900 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900";

function Downloads({ reportId }: { reportId: string }) {
  const sealed = `/api/account/reports/${encodeURIComponent(reportId)}/download`;
  const file = reportPath(reportId, "proof");
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <a href={sealed} download className={downloadButton}>Download sealed report</a>
      {file && (
        <a href={file} download title="The raw sealed data, including the original report, for automated checks."
           className="text-[11px] text-zinc-500 underline underline-offset-2 hover:text-zinc-900">
          Technical seal file (.json)
        </a>
      )}
    </span>
  );
}

export function SealLine({ reportId, info }: { reportId: string; info: SealInfo }) {
  const seal = info.seal;
  if (seal?.status === "confirmed") {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-zinc-700" role="status">
        <span className="font-semibold text-emerald-800">Sealed on Sepolia ✓</span>
        {seal.block_number != null && <span>· block {seal.block_number.toLocaleString("en-US")}</span>}
        {seal.block_time && <span>· {day(seal.block_time)}</span>}
        {seal.explorer_url && <span>· <a href={seal.explorer_url} target="_blank" rel="noopener noreferrer" className={link}>View on Etherscan ↗</a></span>}
        <Downloads reportId={reportId} />
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-700" role="status">
      <span className="font-semibold">Sealing…</span>
      <span>{seal?.status === "submitted" ? "(waiting for a block)" : "(the fingerprint will be sent shortly; your plan is confirmed)"}</span>
      {seal?.explorer_url && <a href={seal.explorer_url} target="_blank" rel="noopener noreferrer" className={link}>Transaction ↗</a>}
    </span>
  );
}
