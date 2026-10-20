"use client";

import { Loader } from "@/components/ui/loader";

// The footer of a one-question-per-screen flow (questionnaire, investments): Back and the position on the
// left, the way forward on the right. There is no Next button: a single choice moves on by itself, so the
// right side shows either a quiet text action ("Continue · Enter", "Skip", ...) or a hint.

export type StepAction = { label: string; onClick: () => void; enter?: boolean; muted?: boolean };

export function StepFooter({ position, total, onBack, backDisabled, error, pending, action, hint }: {
  position: number;            // 1-based
  total: number;
  onBack?: () => void;         // no Back on the first screen
  backDisabled?: boolean;
  error?: string;
  pending?: string;            // e.g. "Scoring your answers"; the loading mark replaces the action while set
  action?: StepAction | null;
  hint?: string;               // shown when there is no action yet
}) {
  return (
    <div className="mt-auto flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-6">
      <span className="flex items-center gap-6">
        {onBack && (
          <button type="button" onClick={onBack} disabled={backDisabled}
                  className="text-sm font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 disabled:cursor-default disabled:opacity-50">
            ← Back
          </button>
        )}
        <span className="text-xs tabular-nums text-zinc-400">{position} / {total}</span>
      </span>
      <span className="flex items-center gap-6 text-xs">
        {error && <span role="alert" className="text-red-600">{error}</span>}
        {pending ? (
          <Loader label={pending.replace(/…$/, "")} size="sm" className="text-xs" />
        ) : action ? (
          <button type="button" key={action.label} onClick={action.onClick}
                  className={`eq-rise font-semibold uppercase tracking-widest ${
                    action.muted ? "text-zinc-400 hover:text-zinc-900" : "text-zinc-900 hover:text-zinc-500"
                  }`}>
            {action.label}
            {action.enter && <span className="font-normal normal-case tracking-normal text-zinc-400"> · Enter</span>}
          </button>
        ) : hint ? (
          <span className="text-zinc-400">{hint}</span>
        ) : null}
      </span>
    </div>
  );
}
