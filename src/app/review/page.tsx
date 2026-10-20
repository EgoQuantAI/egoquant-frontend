"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { markReviewed } from "@/components/onboarding";
import { Paged } from "@/components/paged";
import { Sidebar } from "@/components/sidebar";
import { CategoryLine } from "@/components/category-line";
import { Loader } from "@/components/ui/loader";
import { basisOfProfile, basisSentence } from "@/lib/category";
import { shortDay } from "@/lib/dates";
import { type PortfolioResult, type Session, gameState, useSession } from "@/lib/egoquant";

// Same visual language as the questionnaire (Umut's design). Nothing scrolls: the summary sits on the
// left and the checks page on the right (stacked on a phone). The last onboarding step: "Finish" marks it done and
// goes to the overview.

const primary =
  "border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900";

export default function ReviewPage() {
  const session = useSession();

  return (
    <main className="flex h-screen overflow-hidden bg-white">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b-2 border-zinc-900 py-4 pl-6 pr-20 md:px-12">
          <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">Review · Risk Engine</h1>
          <span className="hidden text-xs font-medium uppercase tracking-widest text-zinc-400 sm:inline">
            Independent Re-check
          </span>
        </div>
        <div className="h-0.5 shrink-0 bg-zinc-100">
          <div className="h-full bg-zinc-900 transition-all duration-500" style={{ width: session?.result ? "100%" : "0%" }} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
          {session === null ? (
            <div className="flex h-full flex-col justify-center px-6 py-10 max-w-2xl md:px-12">
              <Loader label="Loading the review" />
            </div>
          ) : !session.result ? (
            <div className="flex h-full flex-col justify-center px-6 py-10 max-w-2xl md:px-12">
              <p className="eq-rise font-heading text-5xl leading-[1.1] text-zinc-900">No portfolio<br />to review yet.</p>
              <div className="eq-rule my-8 h-px bg-zinc-300" />
              <p className="text-base leading-relaxed text-zinc-600 mb-10">
                The Risk Engine reviews a proposal once it has been built.
              </p>
              <Link href="/portfolio" className={`self-start ${primary}`}>Build Portfolio <span className="eq-arrow">→</span></Link>
            </div>
          ) : (
            <Review result={session.result} builtAt={session.builtAt} session={session} />
          )}
        </div>
      </div>
    </main>
  );
}

function Review({ result, builtAt, session }: { result: PortfolioResult; builtAt?: string; session: Session }) {
  const router = useRouter();
  const failed = result.checks.filter((check) => !check.passed);
  function finish() {
    markReviewed(builtAt);
    router.push("/");
  }
  return (
    <div className="grid grid-cols-1 gap-8 px-6 pt-6 pb-8 md:h-full md:grid-cols-[2fr_3fr] md:gap-14 md:px-12 md:pt-8 md:pb-6">
      <div className="flex min-h-0 flex-col">
        <div className="eq-rise flex items-baseline gap-4 mb-2">
          <p className={`font-heading text-5xl leading-none md:text-7xl short:md:text-6xl ${result.approved ? "text-zinc-900" : "text-red-700"}`}>
            {result.approved ? "Approved" : "Rejected"}
          </p>
          <p className="font-heading text-2xl text-zinc-400">{result.c_level}</p>
        </div>

        <CategoryLine basis={session.profile ? basisOfProfile(session.profile) : null} sentence={basisSentence(result.report)}
                      state={gameState(session)} className="mt-2" />
        <div className="eq-rule my-6 h-px shrink-0 bg-zinc-300" />

        <div className="eq-rise mb-6 grid shrink-0 grid-cols-3 gap-2 md:gap-3 short:mb-4" style={{ "--eq-d": "160ms" } as CSSProperties}>
          <Card label="Checks Passed" value={`${result.checks.length - failed.length}`} suffix={` / ${result.checks.length}`}
                note="Recomputed without the optimizer" />
          {/* the day the prices run to: a saved snapshot is older than the day the report was made (as_of) */}
          <Card label="Prices As Of" value={shortDay(result.prices_as_of ?? result.as_of)} note={(result.prices_as_of ?? result.as_of).slice(0, 4)} />
          <Card label="Data" value={result.data_source === "synthetic" ? "Demo" : "Real"}
                note={result.data_source === "synthetic" ? "Synthetic prices" : result.price_note ? "Saved real prices" : "Market prices"} />
        </div>

        <p className="border-l-4 border-zinc-900 pl-5 text-sm leading-relaxed text-zinc-900">
          The Risk Engine re-checks the proposal on its own: weights, each product&apos;s risk level, the share in
          stocks and the loss in hypothetical stress scenarios. It has the final say; stress results are
          hypothetical, not forecasts.
        </p>

        <div className="mt-auto flex flex-wrap items-center gap-x-8 gap-y-4 pt-6">
          <button type="button" onClick={finish} autoFocus
                  className="eq-rise border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900"
                  style={{ "--eq-d": "320ms" } as CSSProperties}>
            {result.approved ? "Finish · Go to Overview" : "Finish · See What To Change"} <span className="eq-arrow">→</span>
          </button>
          <Link href="/portfolio" className="text-sm font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
            ← Back to Portfolio
          </Link>
        </div>
        <p className="mt-3 text-xs text-zinc-400">Step 5 of 5. You can come back to these checks from the overview at any time.</p>
      </div>

      <div className="eq-rise flex min-h-0 flex-col" style={{ "--eq-d": "240ms" } as CSSProperties}>
        <p className="mb-3 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Every Check</p>
        <Paged
          items={result.checks}
          itemKey={(check, index) => `${check.name}-${index}`}
          noun="checks"
          render={(check) => (
            <div className={`border-l-4 px-5 py-3 ${check.passed ? "border-zinc-200" : "border-red-600 bg-red-50"}`}>
              <p className="text-sm font-semibold text-zinc-900">{check.passed ? "✓" : "✗"} {check.name}</p>
              <p className="mt-0.5 text-sm leading-snug text-zinc-600">{check.detail}</p>
            </div>
          )}
        />
      </div>
    </div>
  );
}

function Card({ label, value, suffix, note }: { label: string; value: string; suffix?: string; note: string }) {
  return (
    <div className="border-2 border-zinc-200 p-3 md:p-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</p>
      <p className="font-heading text-2xl leading-none text-zinc-900 mb-1 md:text-4xl">
        {value}{suffix && <span className="text-zinc-400 text-xl">{suffix}</span>}
      </p>
      <p className="text-xs text-zinc-400">{note}</p>
    </div>
  );
}
