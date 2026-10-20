import type { ReactNode } from "react";

// A quiet full-page message (not found, something broke). No sidebar, no stack trace, no technical text: what
// happened in a sentence, that the saved profile is safe, and a way forward. Server-safe (no hooks) so the 404 can use it.

export const calmPrimary =
  "inline-block border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900";
export const calmSecondary = "text-sm font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900";

export function CalmPage({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col justify-center bg-white px-6 py-16 md:px-20">
      <div className="max-w-2xl">
        <p className="font-heading text-2xl text-zinc-500">EgoQuant</p>
        <h1 className="mt-8 font-heading text-4xl leading-[1.1] text-zinc-900 md:text-5xl">{title}</h1>
        <div className="my-8 h-px bg-zinc-300" />
        <div className="text-base leading-relaxed text-zinc-600">{children}</div>
        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">{actions}</div>
      </div>
    </main>
  );
}
