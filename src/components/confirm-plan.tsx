"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Busy } from "@/components/build-status";
import { Markdown } from "@/components/markdown";
import { parseSealInfo } from "@/components/seal-status";
import { api, detail } from "@/lib/account-api";
import { type AnchoringStatus, type SealInfo, refreshAnchoringStatus, reportPath } from "@/lib/anchoring";

// The "Confirm this plan" agreement and its dialog, used by components/seal-control.tsx (Portfolio page, Account list,
// saved report): the signed-in investor confirms an APPROVED, saved report with FINISHED news and, after agreeing to
// the wording the backend supplies, a fingerprint of the record is sealed on the Sepolia test chain
// (docs/ON_CHAIN_COORDINATION.md). It never changes a number, a limit or a verdict, places no order and moves no money.
// When it is shown (sealing on, approved, signed in, finished news in the saved report) is seal-control.tsx's job.

const compact =
  "border-2 border-zinc-900 bg-zinc-900 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-default disabled:opacity-50";
const quiet = "text-xs font-semibold uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-900";

export function ConfirmForm({ anchoring, reportId, onClose, onConfirmed }: {
  anchoring: AnchoringStatus; reportId: string; onClose: () => void; onConfirmed: (info: SealInfo) => void;
}) {
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    const path = reportPath(reportId, "confirm");
    if (!agree || busy || !path) return;
    setBusy(true);
    setError("");
    const { status, data } = await api(path, {
      method: "POST", body: JSON.stringify({ consent_version: anchoring.consent_version }), timeoutMs: 40_000,
    });
    setBusy(false);
    if (status === 200) {
      onConfirmed(parseSealInfo(data) ?? { commitment: null, confirmed_at: null, seal: null });
    } else if (status === 401) {
      setError("You were signed out. Please log in again.");
    } else if (status === 404) {
      setError("This report is no longer in your account. Build and save it again.");
    } else if (status === 409) {
      setError(detail(data, "This plan cannot be confirmed."));
      if (/consent|agreement|text/i.test(detail(data, ""))) void refreshAnchoringStatus();   // the wording changed: read it again
    } else if (status === 503) {
      setError("Plan sealing is not available right now. Your plan is unchanged.");
    } else {
      setError(detail(data, "Could not confirm the plan. Please try again."));
    }
  }

  return (
    <>
      <div className="max-h-[50vh] overflow-y-auto border-l-4 border-zinc-900 pl-4 pr-2 text-sm leading-relaxed text-zinc-700">
        <Markdown text={anchoring.consent_text} />
      </div>
      <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-snug text-zinc-900">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-zinc-900" />
        <span>I have read this and I agree.</span>
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" className={compact} disabled={!agree || busy} onClick={confirm} aria-busy={busy}>
          {busy ? <Busy label="Confirming" /> : "Confirm and seal"}
        </button>
        <button type="button" className={quiet} onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </>
  );
}

/** A modal: focus goes in, Tab stays inside, Escape and the backdrop close it, focus returns to where it was.
 *  Rendered on <body>, so an animated parent can never trap its position. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });          // always the latest, without re-running the focus effect below
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const items = () => Array.from(panel.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, [tabindex='0']") ?? []);
    (panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0] ?? panel.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { close.current(); return; }
      if (event.key !== "Tab") return;
      const all = items();
      if (!all.length) return;
      const head = all[0], tail = all[all.length - 1];
      if (event.shiftKey && document.activeElement === head) { event.preventDefault(); tail.focus(); }
      else if (!event.shiftKey && document.activeElement === tail) { event.preventDefault(); head.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); before?.focus?.(); };
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-zinc-900/40" onClick={() => close.current()} />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby="confirm-plan-title" tabIndex={-1}
           className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto border-2 border-zinc-900 bg-white p-6 outline-none">
        <p id="confirm-plan-title" className="mb-4 font-heading text-3xl leading-tight text-zinc-900">{title}</p>
        {children}
      </div>
    </div>,
    document.body,
  );
}
