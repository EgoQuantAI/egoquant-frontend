"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { StepReminder } from "@/components/onboarding";
import { StepFooter } from "@/components/step-footer";
import { Paged } from "@/components/paged";
import { Sidebar } from "@/components/sidebar";
import { CategoryLine } from "@/components/category-line";
import { LoadError } from "@/components/load-error";
import { Loader } from "@/components/ui/loader";
import { askHref } from "@/lib/ask";
import { basisOfProfile } from "@/lib/category";
import { focusOnMount } from "@/lib/focus";
import { firstName, useProfile } from "@/lib/profile";
import { clearDraft, loadDraft, saveDraft } from "@/lib/questionnaire-draft";
import {
  type Answers as AnswersBody,
  type Profile,
  type Question,
  type Questionnaire,
  answersWithGame,
  callApi,
  currentSession,
  gameState,
  saveSession,
  useSession,
} from "@/lib/egoquant";

// How long a chosen answer stays on screen before the next question comes in (the ink fill takes ~380 ms).
const AUTO_ADVANCE_MS = 420;

// Design: Umut's section-by-section questionnaire. Questions come from the backend's question bank
// and the backend scores them (one set of rules: egoquant/risk_profile); this page only collects answers.

type Answers = Record<string, string | string[]>;

type Stage =
  | { type: "section_intro"; sectionId: string }
  | { type: "question"; index: number }
  | { type: "results" };

const SECTION_META: Record<string, { roman: string; description: string }> = {
  GL: { roman: "I",  description: "13 questions measuring your willingness to take financial risk. Questions are verbatim from the Grable & Lytton (1999) validated scale." },
  B:  { roman: "II", description: "Questions about your financial situation, investment goal, and time horizon. Determines your ability to absorb potential losses." },
  K:  { roman: "III", description: "Financial literacy and prior investment experience. Results restrict which product types you may access — not your risk category." },
  D:  { roman: "IV", description: "A single gate question. A 'No' answer classifies you as C1 regardless of other scores." },
};

const C_NAMES: Record<string, string> = { C1: "Conservative", C2: "Cautious", C3: "Balanced", C4: "Active", C5: "Aggressive" };
const PRODUCT_NAMES: Record<string, string> = { crypto_etp: "Crypto funds", crypto_spot: "Crypto-assets (spot)" };

// Same bounds as the backend (AnswersIn): amount invested > 0, amounts at most 1e12.
const MAX_AMOUNT = 1e12;

// The two amount questions decide the loss capacity, so they get a play-along note of their own.
const AMOUNT_NOTES: Record<string, string> = {
  B3_invested: "Pretend this is real: the amount you would actually hand to an adviser today, not a round number picked for the demo.",
  B3_needed: "The part of it you would really need back at the end. It sets how much loss your plan can absorb.",
};

/** "25,000", "$25 000" or "25000.50" -> 25000.5; NaN for anything that is not a plain amount ("1e5", "-3", "abc"). */
function parseAmount(raw: string | string[] | undefined): number {
  const text = typeof raw === "string" ? raw.trim().replace(/^\$/, "").replace(/[\s,\u00a0]/g, "") : "";
  return /^\d+(\.\d{1,2})?$/.test(text) ? Number(text) : NaN;
}

const money = (v: number) =>
  `$${v.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;

/** What is wrong with an amount answer, in words; null when it is fine (or still empty). Shown as the person types. */
function numberError(q: Question, answers: Answers): string | null {
  const raw = ((answers[q.id] as string) ?? "").trim();
  if (!raw) return null;
  const v = parseAmount(raw);
  if (Number.isNaN(v)) return "Use digits only, for example 25000 or 25,000 (cents after a dot).";
  if (v > MAX_AMOUNT) return "That is more than 1,000,000,000,000. Enter a smaller amount.";
  if (q.id === "B3_invested" && v === 0) return "The amount you invest must be more than 0.";
  if (q.id === "B3_needed") {
    const invested = parseAmount(answers.B3_invested);
    if (!Number.isNaN(invested) && v > invested) {
      return `This cannot be more than the ${money(invested)} you are investing. Lower it, or go back and change that amount.`;
    }
  }
  return null;
}

function isAnswered(q: Question, answers: Answers): boolean {
  if (q.type === "number") return ((answers[q.id] as string) ?? "").trim() !== "";
  if (q.type === "multi") return ((answers[q.id] as string[]) ?? []).length > 0;
  return !!answers[q.id];
}

function toBody(questions: Question[], answers: Answers, version: string): AnswersBody {
  const choices: Record<string, string> = {};
  const multi: Record<string, string[]> = {};
  for (const q of questions) {
    if (q.type === "single") choices[q.id] = answers[q.id] as string;
    if (q.type === "multi") multi[q.id] = answers[q.id] as string[];
  }
  return {
    questionnaire_version: version,
    choices,
    multi_choices: multi,
    amount_invested: parseAmount(answers.B3_invested),
    amount_needed: parseAmount(answers.B3_needed),
  };
}

/** The saved half-answered questionnaire, kept only as far as this question bank still has it: a screen that no longer
 *  exists is not restored, neither is an answer to a question that is gone; a draft with nothing in it is no draft. */
function restoreDraft(bank: Questionnaire): { answers: Answers; stage: Stage } | null {
  const draft = loadDraft(bank.questionnaire_version);
  if (!draft) return null;
  const ids = new Set(bank.questions.map((x) => x.id));
  const kept: Answers = Object.fromEntries(Object.entries(draft.answers).filter(([id]) => ids.has(id)));
  const target = draft.stage;
  const fits = target.type === "question" ? target.index >= 0 && target.index < bank.questions.length
    : bank.sections.some((s) => s.id === target.sectionId);
  const untouched = Object.keys(kept).length === 0 && target.type === "section_intro" && target.sectionId === bank.sections[0]?.id;
  return fits && !untouched ? { answers: kept, stage: target } : null;
}

const noSubscribe = () => () => {};

export default function QuestionnairePage() {
  const session = useSession();
  // ?welcome=new (just signed up) or =confirmed (came from the email link): greet the person by name once.
  const welcome = useSyncExternalStore(noSubscribe, () => new URLSearchParams(window.location.search).get("welcome"), () => null);
  const name = firstName(useProfile());
  const [bank,    setBank]    = useState<Questionnaire | null>(null);
  const [loadError, setLoadError] = useState("");
  const [stage,   setStage]   = useState<Stage>({ type: "section_intro", sectionId: "GL" });
  const [answers, setAnswers] = useState<Answers>({});
  const [error,   setError]   = useState("");
  const [pending, setPending] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const autoNext = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [attempt, setAttempt] = useState(0);              // "Try again" after the questions could not be loaded

  // No pending auto-advance may fire after the page is gone.
  useEffect(() => () => { if (autoNext.current) clearTimeout(autoNext.current); }, []);

  // Picked up again after a refresh or a closed tab: the answers so far and the screen they were on (lib/questionnaire-draft.ts).
  const [resumed, setResumed] = useState<Stage | null>(null);   // the screen it was picked up on (the note shows there only)
  const [draftChecked, setDraftChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    callApi<Questionnaire>("/api/questionnaire", { method: "GET", timeoutMs: 25_000 })
      .then((data) => {
        if (!alive) return;
        const draft = restoreDraft(data);
        if (draft) { setAnswers(draft.answers); setStage(draft.stage); setResumed(draft.stage); }
        setBank(data);
        setDraftChecked(true);
      })
      .catch((cause: Error) => { if (alive) setLoadError(cause.message); });
    return () => { alive = false; };
  }, [attempt]);

  const QUESTIONS = bank?.questions ?? [];
  const SECTIONS  = bank?.sections ?? [];

  useEffect(() => {
    if (!bank || !draftChecked || stage.type === "results") return;
    if (Object.keys(answers).length === 0 && stage.type === "section_intro" && stage.sectionId === bank.sections[0]?.id) return;
    saveDraft({ version: bank.questionnaire_version, answers, stage });
  }, [bank, draftChecked, answers, stage]);

  function setAnswer(id: string, value: string | string[]) {
    setAnswers(a => ({ ...a, [id]: value }));
    setError("");
  }

  // Single-choice questions have no Next button: picking an answer moves on by itself.
  function choose(id: string, optId: string) {
    if (pending) return;
    const next = { ...answers, [id]: optId };
    setAnswers(next);
    setError("");
    if (autoNext.current) clearTimeout(autoNext.current);
    autoNext.current = setTimeout(() => { autoNext.current = null; void advance(next); }, AUTO_ADVANCE_MS);
  }

  function cancelAutoNext() {
    if (autoNext.current) clearTimeout(autoNext.current);
    autoNext.current = null;
  }

  function toggleMulti(id: string, optId: string) {
    setAnswers(prev => {
      const cur = (prev[id] as string[]) ?? [];
      if (optId === "none") return { ...prev, [id]: ["none"] };
      const base = cur.filter(x => x !== "none");
      const next = base.includes(optId) ? base.filter(x => x !== optId) : [...base, optId];
      return { ...prev, [id]: next };
    });
    setError("");
  }

  function nextStage(current: Stage): Stage {
    if (current.type === "section_intro") {
      const first = QUESTIONS.findIndex(q => q.section === current.sectionId);
      return { type: "question", index: first };
    }
    if (current.type === "question") {
      const next = current.index + 1;
      if (next >= QUESTIONS.length) return { type: "results" };
      if (QUESTIONS[next].section !== QUESTIONS[current.index].section)
        return { type: "section_intro", sectionId: QUESTIONS[next].section };
      return { type: "question", index: next };
    }
    return current;
  }

  // One step back: previous question, or the intro of the section we are in. Answers are kept.
  function back() {
    if (pending || stage.type !== "question") return;
    cancelAutoNext();
    const q = QUESTIONS[stage.index];
    const prev = QUESTIONS[stage.index - 1];
    setError("");
    setStage(prev && prev.section === q.section
      ? { type: "question", index: stage.index - 1 }
      : { type: "section_intro", sectionId: q.section });
  }

  // From a section intro, back goes to the last question of the previous section.
  function backFromIntro(sectionId: string) {
    const first = QUESTIONS.findIndex(qq => qq.section === sectionId);
    cancelAutoNext();
    if (first > 0) setStage({ type: "question", index: first - 1 });
  }

  /** Move on from the current stage. `given` is the answers as just chosen (state may not have caught up). */
  async function advance(given?: Answers) {
    if (!bank || pending) return;
    const a = given ?? answers;
    if (stage.type === "question") {
      const q = QUESTIONS[stage.index];
      if (!isAnswered(q, a)) {
        setError("Please answer this question before continuing.");
        return;
      }
      // An amount problem is already shown under the field, as the person types; Continue stays hidden until fixed.
      if (q.type === "number" && numberError(q, a)) return;
    }
    setError("");
    const next = nextStage(stage);
    if (next.type === "results") {
      const body = toBody(QUESTIONS, a, bank.questionnaire_version);
      setPending(true);
      try {
        const result = await callApi<Profile>("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(answersWithGame(body, currentSession()?.riskGame)),
          timeoutMs: 35_000,
        });
        // A new profile makes an old portfolio stale, and the investments it may choose can change too.
        saveSession({ answers: body, profile: result, interests: undefined, result: undefined });
        clearDraft();
        setProfile(result);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not score the questionnaire.");
        return;
      } finally {
        setPending(false);
      }
    }
    setStage(next);
  }

  function restart() {
    cancelAutoNext();
    clearDraft();
    setResumed(null);
    setAnswers({});
    setProfile(null);
    setStage({ type: "section_intro", sectionId: SECTIONS[0]?.id ?? "GL" });
  }

  // ── Derived state ──
  const qIndex   = stage.type === "question" ? stage.index : -1;
  const q        = qIndex >= 0 ? QUESTIONS[qIndex] : null;
  const qSection = q ? SECTIONS.find(s => s.id === q.section) : null;
  const qInSec   = q ? QUESTIONS.filter(qq => qq.section === q.section) : [];
  const posInSec = q ? qInSec.findIndex(qq => qq.id === q.id) + 1 : 0;
  const progress = stage.type === "results" ? 100
    : stage.type === "question" && QUESTIONS.length ? Math.round((qIndex / QUESTIONS.length) * 100)
    : 0;

  const amountError = q?.type === "number" ? numberError(q, answers) : null;
  const ready    = q ? isAnswered(q, answers) && !amountError : false;
  const many     = q ? q.options.length > 5 : false;   // long option lists sit in two columns

  const introSection = stage.type === "section_intro"
    ? SECTIONS.find(s => s.id === stage.sectionId)
    : null;
  const meta = (introSection && SECTION_META[introSection.id]) || { roman: "", description: "" };

  // "Continue · Enter" on multi-choice questions: Enter continues instead of toggling the focused option.
  // (The amount field handles Enter itself.) Re-subscribed every render so it always sees the latest answers.
  useEffect(() => {
    if (stage.type !== "question" || !q || q.type !== "multi" || !ready || pending) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      void advance();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  return (
    <main className="flex h-screen overflow-hidden bg-white">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex shrink-0 items-center justify-between border-b-2 border-zinc-900 py-4 pl-6 pr-20 md:px-12">
          <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">
            {stage.type === "results"
              ? "Risk Profile · Complete"
              : stage.type === "section_intro"
              ? `Risk Profile · ${introSection?.title ?? "Loading"}`
              : `Risk Profile · ${qSection?.title} · ${posInSec} of ${qInSec.length}`}
          </h1>
          <span className="hidden text-xs font-medium uppercase tracking-widest text-zinc-400 sm:inline">
            Suitability Assessment
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 shrink-0 bg-zinc-100">
          <div
            className="h-full bg-zinc-900 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        {stage.type !== "results" && <StepReminder step="questionnaire" />}

        {/* Content: one screen at a time, never scrolls */}
        <div className="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">

          {!bank && (
            <div className="flex h-full flex-col justify-center px-6 py-8 max-w-2xl md:px-12 md:py-10">
              {loadError
                ? <LoadError message={loadError} onRetry={() => { setLoadError(""); setAttempt((n) => n + 1); }} />
                : <Loader label="Loading the questionnaire" />}
            </div>
          )}

          {/* ── Section intro ── */}
          {bank && stage.type === "section_intro" && introSection && (
              <div key={introSection.id} className="flex min-h-full flex-col justify-center px-6 py-8 max-w-2xl md:h-full md:px-12 md:py-10">
                <p aria-hidden="true" className="eq-rise font-heading text-[5rem] leading-none text-zinc-100">{meta.roman}</p>
                <p className="eq-rise mt-2 font-heading text-4xl leading-tight text-zinc-900" style={{ "--eq-d": "80ms" } as CSSProperties}>
                  {introSection.title}
                </p>
                <div className="eq-rule my-8 h-px bg-zinc-300" style={{ "--eq-d": "200ms" } as CSSProperties} />
                <p className="eq-rise text-base leading-relaxed text-zinc-600 mb-10" style={{ "--eq-d": "260ms" } as CSSProperties}>{meta.description}</p>
                {welcome && !session?.profile && introSection.id === SECTIONS[0]?.id && (
                  <p role="status" className="eq-rise mb-8 border-l-4 border-zinc-900 pl-4 text-sm leading-relaxed text-zinc-900"
                     style={{ "--eq-d": "320ms" } as CSSProperties}>
                    <span className="font-semibold">
                      {welcome === "confirmed" ? "Email confirmed. " : ""}You are in{name ? `, ${name}` : ""}.
                    </span>{" "}
                    Your answers are kept as you go, so you can stop and come back on this device.
                  </p>
                )}
                {session?.profile && !profile && introSection.id === SECTIONS[0]?.id && (
                  <p className="mb-8 border-l-4 border-zinc-900 pl-4 text-sm leading-relaxed text-zinc-600">
                    You already have a profile ({session.profile.c_level}). Completing the questionnaire again
                    replaces it, and your portfolio will need to be rebuilt.
                  </p>
                )}
                <div className="flex items-center gap-8">
                  <button
                    onClick={() => void advance()}
                    autoFocus
                    className="border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900"
                  >
                    Begin <span className="eq-arrow">→</span>
                  </button>
                  {introSection.id !== SECTIONS[0]?.id && (
                    <button
                      onClick={() => backFromIntro(introSection.id)}
                      className="text-sm font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900"
                    >
                      ← Back
                    </button>
                  )}
                </div>
              </div>
          )}

          {/* ── Question ── */}
          {bank && stage.type === "question" && q && (
              <div key={q.id} className="eq-enter flex min-h-full flex-col px-6 pt-6 pb-6 max-w-3xl md:h-full md:px-12 md:pt-8">
                <p className="mb-4 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                  {qSection?.title}
                </p>
                {resumed && stage === resumed && (
                  <p role="status" className="mb-3 shrink-0 text-xs text-zinc-500">Picked up where you left off. Your earlier answers are kept.</p>
                )}

                {q.hint && (
                  <p className="eq-rise mb-3 shrink-0 self-start border-l-4 border-zinc-900 bg-zinc-50 py-1.5 pl-4 pr-3 text-sm font-semibold text-zinc-900">
                    {q.hint}
                  </p>
                )}
                <p ref={focusOnMount} tabIndex={-1} className="mb-6 shrink-0 text-xl leading-relaxed text-zinc-900 outline-none">{q.text}</p>

                {/* Single select: choosing moves on */}
                {q.type === "single" && (
                  <div className={`min-h-0 gap-2 ${many ? "grid grid-cols-1 md:grid-cols-2" : "flex flex-col"}`}>
                    {q.options.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => choose(q.id, opt.id)}
                        disabled={pending}
                        aria-pressed={answers[q.id] === opt.id}
                        className={`eq-choice border-l-4 px-5 py-3.5 text-left text-sm leading-snug ${
                          answers[q.id] === opt.id
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-500 hover:text-zinc-900"
                        }`}
                      >
                        {opt.text}
                      </button>
                    ))}
                  </div>
                )}

                {/* Multi select */}
                {q.type === "multi" && (
                  <>
                    <p className="mb-3 shrink-0 text-xs text-zinc-400">Select all that apply.</p>
                    <div className={`min-h-0 gap-2 ${many ? "grid grid-cols-1 md:grid-cols-2" : "flex flex-col"}`}>
                      {q.options.map(opt => {
                        const sel = ((answers[q.id] as string[]) ?? []).includes(opt.id);
                        return (
                          <button
                            key={opt.id}
                            onClick={() => toggleMulti(q.id, opt.id)}
                            aria-pressed={sel}
                            className={`eq-choice border-l-4 px-5 py-3.5 text-left text-sm leading-snug ${
                              sel
                                ? "border-zinc-900 bg-zinc-900 text-white"
                                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-500"
                            }`}
                          >
                            <span className="flex items-center gap-3">
                              <span className={`flex h-4 w-4 shrink-0 items-center justify-center border-2 ${sel ? "border-zinc-500" : "border-zinc-300"}`}>
                                {sel && <span className="block h-2 w-2 bg-white" />}
                              </span>
                              {opt.text}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Number input */}
                {q.type === "number" && (
                  <div>
                    {AMOUNT_NOTES[q.id] && (
                      <p className="mb-5 border-l-4 border-zinc-900 pl-4 text-sm leading-relaxed text-zinc-600">
                        {AMOUNT_NOTES[q.id]}
                      </p>
                    )}
                    {q.id === "B3_needed" && !Number.isNaN(parseAmount(answers.B3_invested)) && (
                      <p className="mb-3 text-sm text-zinc-400">
                        You are investing {money(parseAmount(answers.B3_invested))}.
                      </p>
                    )}
                    <label className={`flex max-w-xs items-center gap-3 border-b-2 pb-2 transition-colors ${amountError ? "border-red-600" : "border-zinc-900"}`}>
                      <span className="font-medium text-zinc-400">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        autoFocus
                        value={(answers[q.id] as string) ?? ""}
                        onChange={e => setAnswer(q.id, e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") void advance(); }}
                        placeholder="25,000"
                        aria-label={q.text}
                        aria-invalid={!!amountError}
                        aria-describedby={`${q.id}-msg`}
                        className="min-w-0 flex-1 bg-transparent text-xl font-medium text-zinc-900 outline-none placeholder:text-zinc-300"
                      />
                    </label>
                    <p id={`${q.id}-msg`} role={amountError ? "alert" : undefined}
                       className={`mt-2 min-h-5 max-w-md text-sm ${amountError ? "text-red-600" : "text-zinc-400"}`}>
                      {amountError ?? (ready ? `${money(parseAmount(answers[q.id]))} · press Enter to continue` : "Whole dollars are fine; commas are optional.")}
                    </p>
                  </div>
                )}

                <StepFooter
                  position={qIndex + 1}
                  total={QUESTIONS.length}
                  onBack={back}
                  backDisabled={pending}
                  error={error}
                  pending={pending ? "Scoring your answers" : undefined}
                  action={q.type !== "single" && ready
                    ? { label: qIndex === QUESTIONS.length - 1 ? "Complete profile" : "Continue", onClick: () => void advance(), enter: true }
                    : null}
                  hint={q.type === "single" ? "Choose an answer to continue" : "Answer to continue"}
                />
              </div>
          )}

          {/* ── Results ── */}
          {stage.type === "results" && profile && (
            <Results profile={profile} onRestart={restart} name={name} />
          )}

        </div>
      </div>
    </main>
  );
}

function Results({ profile, onRestart, name }: { profile: Profile; onRestart: () => void; name: string | null }) {
  const [confirmRestart, setConfirmRestart] = useState(false);
  const session = useSession();
  const blocked = profile.blocked_product_types.map(t => PRODUCT_NAMES[t] ?? t);
  // The right column's notes, paged if they do not fit.
  const notes = [
    ...profile.explanation.map(line => ({ key: line, node: <p className="border-l-4 border-zinc-900 py-1.5 pl-5 text-sm leading-relaxed text-zinc-900">{line}</p> })),
  ];
  return (
    <div className="grid grid-cols-1 gap-8 px-6 pt-6 pb-8 md:h-full md:grid-cols-2 md:gap-16 md:px-12 md:pt-8 md:pb-6 short:md:pt-4 short:md:pb-3">
      <div className="flex min-h-0 flex-col">
        {name && <p className="eq-rise mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{name}, your risk profile</p>}
        <div className="eq-rise flex items-baseline gap-4">
          <p className="font-heading text-7xl leading-none text-zinc-900 short:text-5xl">{profile.c_level}</p>
          <p className="font-heading text-2xl text-zinc-400">{C_NAMES[profile.c_level]}</p>
        </div>
        <CategoryLine basis={basisOfProfile(profile)} state={gameState(session)} className="mt-2 shrink-0" />
        <div className="eq-rule my-6 h-px shrink-0 bg-zinc-300 short:my-3" />

        <div className="eq-rise grid shrink-0 grid-cols-2 gap-3 short:gap-2" style={{ "--eq-d": "200ms" } as CSSProperties}>
          <ScoreCard label="Attitude to risk" value={String(profile.tolerance_score)}
                     note={`G&L total (13–47) · Attitude level ${profile.tolerance_level} of 5`} />
          <ScoreCard label="Risk Capacity" value={`C${profile.capacity_level}`}
                     note={`Goal-based loss capacity: ${Math.round(profile.loss_capacity * 100)}%`} />
          <ScoreCard label="Financial Literacy" value={String(profile.knowledge_score)} suffix=" / 3"
                     note="Lusardi–Mitchell Big Three" />
          <ScoreCard label="Portfolio Limits" value={`${Math.round(profile.suitability_max_equity * 100)}%`}
                     note={`Max equity · Product risk level up to R${profile.max_r_level}`} />
        </div>

        {blocked.length > 0 && (
          <div className="mt-4 shrink-0 border border-zinc-200 px-4 py-3">
            <p className="text-sm text-zinc-600">
              <span className="font-semibold text-zinc-900">Restricted product types:</span> {blocked.join(", ")}.
            </p>
            <p className="mt-1 text-xs text-zinc-400">Based on financial literacy score. Does not affect your C-level.</p>
          </div>
        )}

        <div className="mt-auto pt-4">
          <p className="text-xs leading-relaxed text-zinc-400">
            A demonstration profile from a hackathon prototype, not a regulated suitability assessment. It is only as
            real as the answers you gave.
          </p>
          {confirmRestart ? (
            <div role="group" aria-label="Answer again?" className="eq-enter mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-l-4 border-red-600 py-1 pl-4">
              <span className="text-sm text-zinc-900">Clear your answers and start the questionnaire over?</span>
              <button type="button" onClick={onRestart} autoFocus
                      className="text-xs font-semibold uppercase tracking-widest text-red-700 hover:text-red-900">Yes, start over</button>
              <button type="button" onClick={() => setConfirmRestart(false)}
                      className="text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">Keep this profile</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmRestart(true)}
                    className="mt-3 text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
              Answer again
            </button>
          )}
        </div>
      </div>

      <div className="eq-rise flex min-h-0 flex-col" style={{ "--eq-d": "280ms" } as CSSProperties}>
        <p className="mb-4 shrink-0 font-heading text-2xl text-zinc-900 short:mb-2">What it means</p>
        <div className="flex min-h-0 flex-1 flex-col">
          <Paged items={notes} itemKey={(n) => n.key} noun="notes" listClassName="flex flex-col" render={(n) => n.node} />
        </div>
        <Link href={askHref(`What does ${profile.c_level} mean for me?`)}
              className="mt-4 shrink-0 text-sm font-semibold text-zinc-900 underline">
          What does {profile.c_level} mean for me? Ask the Advisor
        </Link>
        <div className="mt-6 flex shrink-0 flex-col items-start gap-4 border-t border-zinc-200 pt-5 short:mt-3 short:pt-3 md:flex-row md:items-center md:justify-between md:gap-6">
          <p className="text-xs leading-relaxed text-zinc-500">
            {gameState(session) === "none"
              ? profile?.no_loss_gate
                ? "Next, the Risk Game: about 2 minutes. You said you could not accept any loss, so your category stays C1 whatever the game shows."
                : "Next, the Risk Game: about 2 minutes. It counts one third of your attitude to risk and makes the result fit you."
              : "Next, choose the kinds of investments you would like us to consider. Only the ones your category allows can be picked."}
          </p>
          <Link href={gameState(session) === "none" ? "/game" : "/interests"} className="shrink-0 border-2 border-zinc-900 bg-zinc-900 px-6 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900">
            {gameState(session) === "none" ? "Play the Risk Game" : "Choose Investments"} <span className="eq-arrow">→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ label, value, suffix, note }: { label: string; value: string; suffix?: string; note: string }) {
  return (
    <div className="border-2 border-zinc-200 p-4 short:p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 short:mb-1">{label}</p>
      <p className="font-heading text-4xl leading-none text-zinc-900 mb-1 short:text-3xl">
        {value}{suffix && <span className="text-zinc-400 text-xl">{suffix}</span>}
      </p>
      <p className="text-xs text-zinc-400">{note}</p>
    </div>
  );
}
