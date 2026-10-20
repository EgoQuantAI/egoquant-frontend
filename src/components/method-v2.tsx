"use client";

import { type MethodV2, EFFECTIVE_N_NOTE, capSentences, methodWords, searchSentence, selectionSentence, smallPositionsNote, summaryLine } from "@/lib/method-v2";

// Portfolio method v2, drawn for the Method, Holdings and Why tabs (see lib/method-v2.ts for the data and the wording).
// Every part renders nothing when the report has no v2 diagnostics.

/** Funds held: the backend's own count when it sent one, else the report's holdings with a weight, else the funds that carry risk. */
export function fundsHeld(method: MethodV2, weights: number[] | null): number | null {
  if (method.nHoldings !== null && method.nHoldings > 0) return method.nHoldings;
  if (weights) return weights.filter((w) => w > 0.0005).length || null;
  return method.riskShares.filter((s) => s.share > 0.0005).length || null;
}

/** Method tab: the method in plain words, "N funds, effective N x.x, largest y%", and how wide the search was. */
export function MethodV2Card({ method, weights }: { method: MethodV2; weights: number[] | null }) {
  const words = methodWords(method.method);
  const line = summaryLine(method, fundsHeld(method, weights));
  const search = searchSentence(method);
  const picked = selectionSentence(method);
  const held = capSentences(method);
  return (
    <div className="mb-5 shrink-0 border-l-4 border-zinc-900 pl-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">How the weights were built</p>
      <p className="mt-1 text-sm leading-relaxed text-zinc-900">
        {words && <><span className="font-semibold">{words.name}.</span> {words.what}</>}
        {!words && "The weights were built by a fixed, rules-based method; no one chose them by hand."}
      </p>
      {line && <p className="mt-2 font-heading text-xl leading-tight text-zinc-900">{line}</p>}
      {method.effectiveN !== null && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{EFFECTIVE_N_NOTE}</p>}
      {picked && <p className="mt-2 text-sm leading-relaxed text-zinc-700">{picked}</p>}
      {held.map((text) => (
        <p key={text} className="mt-2 text-sm leading-relaxed text-zinc-700">{text}</p>
      ))}
      {search && <p className="mt-2 text-xs leading-relaxed text-zinc-500">{search}</p>}
    </div>
  );
}

/** Holdings tab: the one-line summary above the list. */
export function MethodV2Line({ method, weights }: { method: MethodV2; weights: number[] }) {
  const funds = fundsHeld(method, weights);
  const line = summaryLine(method, funds);
  if (!line) return null;
  const small = smallPositionsNote(weights.filter((w) => w > 1e-6).length, funds);
  return (
    <p className="mb-4 shrink-0 text-sm text-zinc-900">
      <span className="font-semibold">{line}.</span>{" "}
      <span className="text-xs text-zinc-500">{[small, method.effectiveN !== null ? EFFECTIVE_N_NOTE : ""].filter(Boolean).join(" ")}</span>
    </p>
  );
}

/** Holdings tab: a bar under a fund, as long as its share of the portfolio's risk compared with the largest share. */
export function RiskBar({ share, max }: { share: number; max: number }) {
  const width = max > 0 ? Math.max(2, Math.round((share / max) * 100)) : 0;
  return (
    <div aria-hidden="true" className="mt-1.5 h-1.5 w-full bg-zinc-100">
      <div className="h-full bg-zinc-900" style={{ width: `${width}%` }} />
    </div>
  );
}
