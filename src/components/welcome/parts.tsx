"use client";

import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Busy } from "@/components/build-status";

// The building blocks of the sign-up and login screens: one question per screen, a progress bar, Back, and the way
// to the other form on every step. Same visual language as the questionnaire (zinc, border-2, uppercase labels,
// eq-rise / eq-enter / eq-choice / eq-tick).

export const primary =
  "inline-flex items-center gap-3 border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-zinc-900 disabled:hover:text-white";
export const quiet = "text-sm font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 disabled:opacity-40";
export const delay = (ms: number) => ({ "--eq-d": `${ms}ms` }) as CSSProperties;

/** A whole step: progress, the step (keyed, so each new one slides in), and the footer row. Submitting the form
 *  (Enter in a field, or the main button) is the way forward. */
export function StepFrame({ stepKey, position, total, onBack, aside, onSubmit, children }: {
  stepKey: string;
  position: number;            // 1-based; 0 hides the progress (login, inbox)
  total: number;
  onBack?: () => void;
  aside: ReactNode;            // "Have an account? Log in" (or the reverse)
  onSubmit: () => void;
  children: ReactNode;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }
  // Enter moves on from anywhere on the step, also where no text field has focus (welcome, the agreements).
  // A text field submits the form itself; a button or link keeps its own Enter.
  const latest = useRef(onSubmit);
  useEffect(() => { latest.current = onSubmit; });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, textarea, select")) return;
      if (target instanceof HTMLInputElement && target.type !== "checkbox") return;
      event.preventDefault();
      latest.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form onSubmit={submit} noValidate className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="h-0.5 shrink-0 bg-zinc-100" aria-hidden={position === 0}>
        {position > 0 && (
          <div className="h-full bg-zinc-900 transition-all duration-500" style={{ width: `${(position / total) * 100}%` }} />
        )}
      </div>
      <div key={stepKey} className="eq-enter flex min-h-0 flex-1 flex-col justify-center px-6 py-6 md:px-12 md:py-8">
        <div className="w-full max-w-xl">{children}</div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-zinc-100 px-6 py-4 md:px-12">
        <span className="flex items-center gap-6">
          {onBack && <button type="button" onClick={onBack} className={quiet}>← Back</button>}
          {position > 0 && <span className="text-xs tabular-nums text-zinc-400">Step {position} of {total}</span>}
        </span>
        <span className="text-sm text-zinc-500">{aside}</span>
      </div>
    </form>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <p className="eq-rise mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{children}</p>;
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <h2 className="eq-rise font-heading text-4xl leading-[1.1] text-zinc-900 outline-none md:text-5xl" style={delay(60)}>
      {children}
    </h2>
  );
}

/** A big underlined field with its message under it. `problem` shows only once `shown` (after a try, or a blur). */
export function Field({ label, value, onChange, problem, shown, onBlur, type = "text", autoComplete, inputMode,
                        placeholder, note, trailing, maxLength, autoFocus = true }: {
  label: string; value: string; onChange: (value: string) => void; problem: string; shown: boolean; onBlur?: () => void;
  type?: string; autoComplete?: string; inputMode?: "email" | "text"; placeholder?: string; note?: ReactNode;
  trailing?: ReactNode; maxLength?: number; autoFocus?: boolean;
}) {
  const id = useId();
  const visible = shown && !!problem;
  return (
    <div className="eq-rise mt-8" style={delay(140)}>
      <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</label>
      <div className={`mt-1 flex items-center gap-3 border-b-2 pb-2 transition-colors ${visible ? "border-red-600" : "border-zinc-900"}`}>
        <input id={id} type={type} value={value} autoFocus={autoFocus} autoComplete={autoComplete} inputMode={inputMode}
               placeholder={placeholder} maxLength={maxLength} spellCheck={false} autoCapitalize={type === "text" ? "words" : "none"}
               aria-invalid={visible} aria-describedby={`${id}-msg`}
               onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
               className="min-w-0 flex-1 bg-transparent text-2xl font-medium text-zinc-900 outline-none placeholder:text-zinc-300" />
        {trailing}
      </div>
      <p id={`${id}-msg`} role={visible ? "alert" : undefined}
         className={`mt-2 min-h-5 text-sm ${visible ? "text-red-600" : "text-zinc-400"}`}>
        {visible ? problem : note}
      </p>
    </div>
  );
}

/** A tickable row: never ticked until the person ticks it. The tick writes itself in (eq-tick). */
export function Tick({ checked, onChange, children, required, details }: {
  checked: boolean; onChange: (checked: boolean) => void; children: ReactNode; required?: boolean; details?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-l-4 transition-colors ${checked ? "border-zinc-900" : "border-zinc-200 hover:border-zinc-500"}`}>
      <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span aria-hidden="true"
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-zinc-400 ${
                checked ? "border-zinc-900 bg-zinc-900" : "border-zinc-300 bg-white"
              }`}>
          {checked && <span className="eq-tick text-xs font-bold leading-none text-white">✓</span>}
        </span>
        <span className="min-w-0 flex-1 text-sm leading-snug text-zinc-800">
          {children}
          <span className={`ml-2 text-[10px] font-semibold uppercase tracking-widest ${required ? "text-zinc-900" : "text-zinc-400"}`}>
            {required ? "Required" : "Optional"}
          </span>
        </span>
      </label>
      {details && (
        <div className="px-4 pb-3 pl-12">
          <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
                  className="text-xs font-semibold text-zinc-500 underline hover:text-zinc-900">
            {open ? "Hide the full text" : "Read the full text"}
          </button>
          {open && <p className="eq-enter mt-1 max-h-28 overflow-y-auto text-xs leading-relaxed text-zinc-500">{details}</p>}
        </div>
      )}
    </div>
  );
}

/** The main button; while `busy`, the shared loading mark in the button's own colour with what is happening. */
export function Go({ label, busy, busyLabel, disabled }: { label: string; busy?: boolean; busyLabel?: string; disabled?: boolean }) {
  return (
    <button type="submit" disabled={disabled || busy} className={`eq-rise mt-2 ${primary}`} style={delay(220)}>
      {busy ? <Busy label={busyLabel ?? label} /> : (
        <>{label} <span className="eq-arrow">→</span><span className="hidden text-[10px] font-normal normal-case tracking-normal opacity-60 sm:inline">Enter</span></>
      )}
    </button>
  );
}

export function ShowPassword({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={shown}
            className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 hover:text-zinc-900">
      {shown ? "Hide" : "Show"}
    </button>
  );
}
