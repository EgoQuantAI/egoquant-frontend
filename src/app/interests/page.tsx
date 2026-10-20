"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { IbkrPanel } from "@/components/ibkr-panel";
import { InterestAreas } from "@/components/interest-areas";
import { LoadError } from "@/components/load-error";
import { INTEREST_AREA_LIMIT } from "@/lib/build-timing";
import { GameInvite } from "@/components/game-invite";
import { StepReminder } from "@/components/onboarding";
import { StepFooter } from "@/components/step-footer";
import { Sidebar } from "@/components/sidebar";
import { Loader } from "@/components/ui/loader";
import {
  type Answers,
  type PortfolioOptions,
  type PreferenceForm,
  type PreferenceQuestion,
  type Session,
  answersWithGame,
  applies,
  callApi,
  gameState,
  saveSession,
  useSession,
} from "@/lib/egoquant";
import { ASSUMED, type Choices, effective, shortText, summaryOf } from "@/lib/interest-choices";
import { interestsNotice, useFreshProfile } from "@/lib/risk-game";
import { focusOnMount } from "@/lib/focus";
import { type IbkrInput, getIbkr } from "@/lib/ibkr";

// Step II of onboarding: after the C-level, the investor picks the kinds of investments they want.
// The backend builds the questions for THIS profile (egoquant/preferences), so options the risk category
// or knowledge answers do not allow are shown greyed out with the reason. Agent C then fetches market
// data only for what is picked here, most relevant first. Same visual language as the questionnaire:
// one question per screen (nothing scrolls), a single choice moves on by itself, a multiple choice
// continues with Enter or "Continue", and an optional question can be skipped.

const primary =
  "border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-default disabled:opacity-50";
const EXCLUSIVE = new Set(["no_preference", "none"]);
// The industries someone wants (P2) and the industries to avoid (P5) share option ids; the backend refuses a build that
// holds one id in both (egoquant/preferences/form.py), so this page does not let a person pick the same one twice.
const WANTED_INDUSTRIES = "P2";
const AVOID_QUESTION = "P5";
function clashReason(questionId: string, optionId: string, picked: Choices): string | null {
  if (questionId === AVOID_QUESTION && (picked[WANTED_INDUSTRIES] ?? []).includes(optionId)) return "you chose it as an interest";
  if (questionId === WANTED_INDUSTRIES && (picked[AVOID_QUESTION] ?? []).includes(optionId)) return "you chose to avoid it";
  return null;
}
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];
const AUTO_ADVANCE_MS = 420;   // a single choice stays visible this long before the next question

export default function InterestsPage() {
  const session = useSession();
  const [progress, setProgress] = useState(0);     // share of this step's screens done, set by the form

  return (
    <main className="flex h-screen overflow-hidden bg-white">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b-2 border-zinc-900 py-4 pl-6 pr-20 md:px-12">
          <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">Investments · Your Interests</h1>
          <span className="hidden text-xs font-medium uppercase tracking-widest text-zinc-400 sm:inline">Market Data Selection</span>
        </div>
        <div className="h-0.5 shrink-0 bg-zinc-100">
          <div className="h-full bg-zinc-900 transition-all duration-500" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        {session?.profile && <StepReminder step="interests" />}

        <div className="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
          {session === null ? (
            <Centered><Loader label="Loading your profile" /></Centered>
          ) : !session.answers || !session.profile ? (
            <NeedsProfile />
          ) : !session.interests && gameState(session) === "none" ? (
            <NeedsGame />
          ) : (
            <InterestsForm session={session} answers={session.answers} onProgress={setProgress} />
          )}
        </div>
      </div>
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col justify-center px-6 py-10 max-w-2xl md:px-12">{children}</div>;
}

function NeedsProfile() {
  return (
    <Centered>
      <p className="eq-rise font-heading text-5xl leading-[1.1] text-zinc-900">Complete your<br />profile first.</p>
      <div className="eq-rule my-8 h-px bg-zinc-300" />
      <p className="text-base leading-relaxed text-zinc-600 mb-10">
        Which investments you can choose depends on your risk profile, so the profile must be on file first.
      </p>
      <Link href="/questionnaire" className={`self-start ${primary}`}>Start Risk Profile →</Link>
    </Centered>
  );
}

/** The Risk Game comes before the investments: it is part of the category, and the category decides which products are offered. */
function NeedsGame() {
  return (
    <Centered>
      <p className="eq-rise font-heading text-5xl leading-[1.1] text-zinc-900">Before you choose<br />investments.</p>
      <div className="eq-rule my-8 h-px bg-zinc-300" />
      <p className="mb-6 text-base leading-relaxed text-zinc-600">
        Which investments you may choose depends on your risk category, and the Risk Game is part of it.
      </p>
      {/* a skip is stored in the session, which re-renders this page into the investments questions */}
      <GameInvite onSkipped={() => undefined} />
    </Centered>
  );
}

function InterestsForm({ session, answers, onProgress }: {
  session: Session; answers: Answers; onProgress: (share: number) => void;
}) {
  const router = useRouter();
  const saved = session.interests;
  const game = session.riskGame;
  const category = session.profile?.c_level;
  const [platformList, setPlatformList] = useState<PortfolioOptions["trading_platforms"] | null>(null);
  const [platforms, setPlatforms] = useState<string[]>(saved?.trading_platforms ?? []);
  const [choices, setChoices] = useState<Choices>(saved?.preferences.choices ?? {});
  const [form, setForm] = useState<PreferenceForm | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  // Optional IBKR trading history (in memory only, see lib/ibkr.ts): never part of what is saved below.
  const [ibkr, setIbkrState] = useState<IbkrInput | null>(() => getIbkr());
  const autoNext = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (autoNext.current) clearTimeout(autoNext.current); }, []);

  // A profile scored before the game it now has (an older session) is scored again first; if that takes options away, say so.
  const rescored = useFreshProfile(session);
  const notice = rescored ? interestsNotice(rescored) : null;

  const [attempt, setAttempt] = useState(0);              // "Try again" after the options could not be loaded
  useEffect(() => {
    let alive = true;
    callApi<PortfolioOptions>("/api/portfolio/options", { method: "GET", timeoutMs: 25_000 })
      .then((data) => { if (alive) setPlatformList(data.trading_platforms); })
      .catch((cause: Error) => { if (alive) setLoadError(cause.message); });
    return () => { alive = false; };
  }, [attempt]);

  // The form depends on the profile and the trading platforms: ask again when the platforms change.
  useEffect(() => {
    let alive = true;
    callApi<PreferenceForm>("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: answersWithGame(answers, game), trading_platforms: platforms }),
      timeoutMs: 30_000,
    })
      .then((data) => { if (alive) { setForm(data); setLoadError(""); } })
      .catch((cause: Error) => { if (alive) setLoadError(cause.message); });
    return () => { alive = false; };
    // the category (and so the form) can change when the game is scored in
  }, [answers, platforms, game, category, attempt]);

  // One screen per question: where you trade, then each question that applies to what is picked so far.
  const visibleQuestions = form ? form.questions.filter((q) => !(q.id in ASSUMED) && applies(q, effective(form, choices))) : [];
  const steps = ["platforms", ...visibleQuestions.map((q) => q.id), "ibkr"];
  const stepIndex = Math.min(step, steps.length - 1);
  const current = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  useEffect(() => { onProgress(form ? stepIndex / steps.length : 0); }, [form, stepIndex, steps.length, onProgress]);

  // Enter continues a multiple-choice screen once something is picked (instead of toggling the focused
  // option). Re-subscribed every render so it always sees the latest choices.
  useEffect(() => {
    if (!form) return;
    if (current === "ibkr") return;   // typing and file picking there; the footer action continues
    const q = current === "platforms" ? null : form.questions.find((x) => x.id === current);
    if (q?.type === "single" && !isLast) return;   // a single choice moves on by itself
    const has = q ? (effective(form, choices)[q.id] ?? []).length > 0 : platforms.length > 0;
    if (!has) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      goNext();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  function togglePlatform(id: string) {
    setPlatforms((list) => (list.includes(id) ? list.filter((p) => p !== id) : [...list, id]));
  }

  function pick(q: PreferenceQuestion, optionId: string) {
    setError("");
    setChoices((prev) => {
      const current = prev[q.id] ?? [];
      let next: string[];
      if (q.type === "single") next = [optionId];
      else if (current.includes(optionId)) next = current.filter((id) => id !== optionId);
      else if (EXCLUSIVE.has(optionId)) next = [optionId];
      else next = [...current.filter((id) => !EXCLUSIVE.has(id)), optionId];
      return { ...prev, [q.id]: next };
    });
    // A single choice moves on by itself, except on the last screen (that one saves).
    if (q.type === "single" && !isLast) {
      if (autoNext.current) clearTimeout(autoNext.current);
      autoNext.current = setTimeout(() => { autoNext.current = null; setStep((s) => s + 1); }, AUTO_ADVANCE_MS);
    }
  }

  function goBack() {
    if (autoNext.current) clearTimeout(autoNext.current);
    autoNext.current = null;
    setError("");
    setStep((s) => Math.max(0, s - 1));
  }

  function goNext() {
    if (!form) return;
    const q = current === "platforms" ? null : form.questions.find((x) => x.id === current);
    if (q && q.required && !(effective(form, choices)[q.id] ?? []).length) {
      return setError("Pick at least one kind of investment you would like us to consider.");
    }
    setError("");
    if (isLast) submit();
    else setStep((s) => s + 1);
  }

  function submit() {
    if (!form) return;
    const picked = effective(form, choices);
    const missing = form.questions.find((q) => applies(q, picked) && q.required && !(picked[q.id] ?? []).length);
    if (missing) return setError("Pick at least one kind of investment you would like us to consider.");
    const clashing = (picked[AVOID_QUESTION] ?? []).filter((id) => (picked[WANTED_INDUSTRIES] ?? []).includes(id));
    if (clashing.length) {            // an older session can hold both: the options are blocked now, but what was saved stays
      const names = clashing.map((id) => form.questions.flatMap((q) => q.options).find((o) => o.id === id)?.text ?? id);
      return setError(`${names.join(", ")}: you chose it as an interest and also as something to avoid. Go back and change one of them.`);
    }

    const summary = summaryOf(form, picked);
    const interests = {
      preferences: { preferences_version: form.preferences_version, choices: picked },
      trading_platforms: platforms,
      summary,
    };
    // A trading history added here also makes the old portfolio stale: it was built without it.
    const changed = JSON.stringify(saved?.preferences) !== JSON.stringify(interests.preferences) ||
      JSON.stringify(saved?.trading_platforms ?? []) !== JSON.stringify(platforms) || ibkr !== null;
    // New interests make a portfolio built for the old ones stale: it must be rebuilt with fresh data.
    const ok = saveSession(changed ? { interests, result: undefined } : { interests });
    if (!ok) return setError("Your browser blocked saving your choices. Allow site storage and retry.");
    router.push("/portfolio");
  }

  if (loadError && (!form || !platformList)) {
    return <Centered><LoadError message={loadError} onRetry={() => { setLoadError(""); setAttempt((n) => n + 1); }} /></Centered>;
  }
  if (!form || !platformList) {
    return <Centered><Loader label="Loading the options for your profile" /></Centered>;
  }

  const picked = effective(form, choices);
  // The wording of the questions for each area ("us_stocks" -> "U.S. stocks"); the first question that offers one wins.
  const areaNames: Record<string, string> = {};
  for (const q of form.questions) for (const o of q.options) if (!(o.id in areaNames)) areaNames[o.id] = shortText(o.text);
  const onIbkr = current === "ibkr";
  const question = current === "platforms" || onIbkr ? null : form.questions.find((q) => q.id === current) ?? null;
  const hasPick = onIbkr ? ibkr !== null : question ? (picked[question.id] ?? []).length > 0 : platforms.length > 0;
  const optional = !question || !question.required;
  const nextLabel = isLast ? (hasPick ? "Save and continue" : "Skip and continue") : hasPick ? "Continue" : "Skip";

  return (
    <div className="flex h-full flex-col px-6 pt-6 pb-6 md:px-12 md:pt-8 short:md:pt-4 short:md:pb-3">
      <p className="mb-5 shrink-0 short:mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
        Your risk category {form.c_level} · products up to risk level R{form.max_r_level}
      </p>
      {notice && (
        <p role="status" className="mb-4 max-w-3xl shrink-0 border-l-4 border-zinc-900 pl-5 text-sm leading-relaxed text-zinc-900">{notice}</p>
      )}

      <div key={current} className="eq-enter flex min-h-0 flex-1 flex-col max-w-4xl">
        {onIbkr ? (
          <Section roman={ROMAN[stepIndex] ?? ""} label="Optional" text="Do you trade with Interactive Brokers?"
                   note="We can check how you behaved in past market falls from your trades. Add them, or skip."
                   wide>
            <IbkrPanel onChange={setIbkrState} />
          </Section>
        ) : question === null ? (
          <Section roman={ROMAN[0]} label="Optional" text="Where do you trade?"
                   note="Limits the investments to ones you can buy there, and decides where their prices come from. Select all that apply."
                   intro={`We only fetch prices and news for what you pick, for up to ${INTEREST_AREA_LIMIT} areas in a fixed order (broad areas first); you will see how many are used as you choose. Options your profile does not allow are shown but cannot be chosen. These answers never change your risk category or its limits.`}>
            {platformList.map((platform) => (
              <OptionButton key={platform.id} selected={platforms.includes(platform.id)}
                            onClick={() => togglePlatform(platform.id)}>
                {platform.name}
              </OptionButton>
            ))}
          </Section>
        ) : (
          <Section roman={ROMAN[stepIndex] ?? ""} label={question.required ? "Required" : "Optional"} text={question.text}
                   note={question.type === "multi" ? "Select all that apply." : "Choose one."}>
            {question.options.map((o) => {
              const clash = clashReason(question.id, o.id, picked);       // wanted AND avoided: the backend would refuse the build
              const blocked = !o.available || !!clash;
              return (
                <OptionButton key={o.id} selected={!blocked && (picked[question.id] ?? []).includes(o.id)}
                              disabled={blocked} onClick={() => pick(question, o.id)}>
                  {o.text}
                  {!o.available && o.reason ? <span className="ml-2 text-xs">· {o.reason}</span>
                    : clash ? <span className="ml-2 text-xs">· {clash}</span> : null}
                </OptionButton>
              );
            })}
          </Section>
        )}
      </div>

      {question && (
        <div className="mb-3 max-w-4xl">
          <InterestAreas answers={answers} platforms={platforms} names={areaNames}
                         preferences={{ preferences_version: form.preferences_version, choices: picked }} />
        </div>
      )}

      <StepFooter
        position={stepIndex + 1}
        total={steps.length}
        onBack={stepIndex > 0 ? goBack : undefined}
        error={error}
        action={hasPick
          ? { label: nextLabel, onClick: goNext, enter: true }
          : optional
          ? { label: nextLabel, onClick: goNext, muted: true }
          : null}
        hint={question?.type === "single" ? "Choose an answer to continue" : "Pick at least one to continue"}
      />
    </div>
  );
}

function Section({ roman, label, text, note, intro, wide, children }: {
  roman: string; label: string; text: string; note: string; intro?: string; wide?: boolean; children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {intro && (
        <p className="mb-6 max-w-2xl shrink-0 border-l-4 border-zinc-900 pl-5 text-sm leading-relaxed text-zinc-600 short:mb-3 short:text-xs">{intro}</p>
      )}
      <div className="mb-5 flex shrink-0 items-baseline gap-4 short:mb-2">
        <span aria-hidden="true" className="font-heading text-5xl leading-none text-zinc-200 short:text-4xl">{roman}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</span>
      </div>
      <p ref={focusOnMount} tabIndex={-1} className="mb-1 max-w-2xl shrink-0 text-xl leading-relaxed text-zinc-900 outline-none">{text}</p>
      <p className="mb-5 shrink-0 text-xs text-zinc-400">{note}</p>
      {wide ? (
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      ) : (
        // On a short screen only the options scroll (thin bar), never the question or the footer.
        <div className="eq-scroll grid min-h-0 grid-cols-1 content-start gap-2 overflow-y-auto sm:grid-cols-2">{children}</div>
      )}
    </div>
  );
}

function OptionButton({
  selected, disabled = false, onClick, children,
}: { selected: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`eq-choice border-l-4 px-4 py-3 text-left text-sm leading-snug ${
        disabled
          ? "cursor-not-allowed border-zinc-100 bg-white text-zinc-400"
          : selected
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-500 hover:text-zinc-900"
      }`}
    >
      <span className="flex items-center gap-3">
        <span className={`flex h-4 w-4 shrink-0 items-center justify-center border-2 ${selected ? "border-zinc-500" : "border-zinc-300"}`}>
          {selected && <span className="block h-2 w-2 bg-white" />}
        </span>
        <span className="flex-1">{children}</span>
      </span>
    </button>
  );
}
