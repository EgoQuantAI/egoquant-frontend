"use client";

// A page that could not load what it needs says so in plain words and offers the way forward: try again.
// (A sentence alone leaves a nervous person on a dead page.)

const button =
  "border-2 border-zinc-900 bg-zinc-900 px-6 py-2 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900";

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <p role="alert" className="border-l-4 border-red-600 pl-4 text-sm leading-relaxed text-zinc-900">{message}</p>
      <button type="button" onClick={onRetry} className={button}>Try again</button>
    </div>
  );
}
