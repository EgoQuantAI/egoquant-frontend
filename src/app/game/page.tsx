"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { CategoryLine } from "@/components/category-line";
import { CrashTest } from "@/components/crash-test";
import { GAME_PITCH, GameInvite } from "@/components/game-invite";
import { StepReminder } from "@/components/onboarding";
import { Sidebar } from "@/components/sidebar";
import { PageLoader } from "@/components/ui/loader";
import { basisOfProfile } from "@/lib/category";
import { type CrashTest as CrashTestResult, currentSession, gameState, saveSession, useSession } from "@/lib/egoquant";
import { type CategoryChange, applyGame, interestsNotice } from "@/lib/risk-game";

// How long a round's outcome stays on screen before the game moves on.
const RESULT_MS = 2200;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Card {
  id: number;
  winChance: number;
  winAmount: number;
  loseAmount: number;
  label: string;
}

interface RoundRecord {
  riskRank: number;    // 1 = riskiest choice, 5 = safest
  outcome: "win" | "lose";
  significant: boolean; // lose amount >= $100
}

type Phase = "choosing" | "spinning" | "result" | "crash" | "done";
type ProfileStatus = "loading" | "missing" | "ready";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOTAL_ROUNDS = 7;
const STARTING_BALANCE = 1000;

// Fixed win probabilities spread across the risk spectrum
const WIN_PROBS = [0.05, 0.15, 0.30, 0.50, 0.75];
const STAKES    = [50,   80,   100,  120,  150];

const RISK_LABELS: Record<number, string> = {
  0.05: "Extreme",
  0.15: "High",
  0.30: "Moderate",
  0.50: "Balanced",
  0.75: "Conservative",
};

// ─── Card generation ──────────────────────────────────────────────────────────

function generateCards(): Card[] {
  // Shuffle probabilities and stakes independently each round
  const probs   = [...WIN_PROBS].sort(() => Math.random() - 0.5);
  const stakes  = [...STAKES].sort(() => Math.random() - 0.5);

  return probs.map((winChance, i) => {
    const loseAmount = stakes[i];
    // Zero-EV constraint: winAmount * P(win) = loseAmount * P(lose)
    const winAmount = Math.round((loseAmount * (1 - winChance)) / winChance);
    return { id: i, winChance, winAmount, loseAmount, label: RISK_LABELS[winChance] };
  });
}

// Rank 1 = riskiest (lowest win chance), 5 = safest
function getRiskRank(card: Card, allCards: Card[]): number {
  const sorted = [...allCards].sort((a, b) => a.winChance - b.winChance);
  return sorted.findIndex((c) => c.id === card.id) + 1;
}

// ─── Wheel math ───────────────────────────────────────────────────────────────

// Returns the total rotation the wheel should reach so the pointer (fixed at
// top) lands inside the win or lose conic sector.
function targetRotation(
  current: number,
  outcome: "win" | "lose",
  winChance: number
): number {
  const winDeg  = winChance * 360;
  const loseDeg = 360 - winDeg;
  const extra   = 4 * 360; // 4 full spins for drama

  // Pick a landing angle (measured from top, clockwise) inside the sector.
  // We avoid the edges to make the result unambiguous.
  let target: number;
  if (outcome === "win") {
    target = winDeg * 0.15 + Math.random() * winDeg * 0.70;
  } else {
    target = winDeg + loseDeg * 0.15 + Math.random() * loseDeg * 0.70;
  }

  // After rotating by R degrees, the pointer reads angle (360 - R) % 360.
  // So to read `target`, we need: R ≡ (360 - target) mod 360
  const adjustment = ((360 - target) - (current % 360) + 360) % 360;
  return current + extra + adjustment;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function computeScores(history: RoundRecord[]) {
  if (history.length === 0) return { tolerance: 50, lossAcceptance: 50 };

  // Risk tolerance: average rank maps to 0–100 (rank 1 riskiest → 100)
  const avgRank  = history.reduce((s, r) => s + r.riskRank, 0) / history.length;
  const tolerance = Math.round(((5 - avgRank) / 4) * 100);

  // Loss acceptance: after a significant loss, did they pick riskier or safer?
  const postLossRanks: number[] = [];
  history.forEach((r, i) => {
    if (r.significant && r.outcome === "lose" && i + 1 < history.length) {
      postLossRanks.push(history[i + 1].riskRank);
    }
  });

  let lossAcceptance = 50;
  if (postLossRanks.length > 0) {
    const avgPostLoss = postLossRanks.reduce((s, r) => s + r, 0) / postLossRanks.length;
    lossAcceptance = Math.round(((5 - avgPostLoss) / 4) * 100);
  }

  return { tolerance, lossAcceptance };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProbabilityArc({ winChance, active }: { winChance: number; active: boolean }) {
  const r   = 24;
  const cx  = 32;
  const cy  = 32;
  const c   = 2 * Math.PI * r;
  const arc = winChance * c;

  return (
    <svg width={64} height={64} viewBox="0 0 64 64" aria-hidden>
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={active ? "#52525b" : "#e4e4e7"} strokeWidth={5} />
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={active ? "#ffffff" : "#18181b"} strokeWidth={5}
        strokeDasharray={`${arc} ${c}`}
        strokeLinecap="butt"
        transform={`rotate(-90 ${cx} ${cy})`} />
      <text x={cx} y={cy + 5} textAnchor="middle"
        fontSize={13} fontWeight={700}
        fill={active ? "#ffffff" : "#18181b"}>
        {Math.round(winChance * 100)}%
      </text>
    </svg>
  );
}

function ScoreBar({ label, score, note }: { label: string; score: number; note: string }) {
  return (
    <div className="border-2 border-zinc-200 p-6">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-4">
        {label}
      </p>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-heading text-5xl leading-none text-zinc-900">{score}</span>
        <span className="text-zinc-400 text-sm">/ 100</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-100 mb-4">
        <div
          className="h-full rounded-full bg-zinc-900 transition-all duration-700"
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-sm leading-relaxed text-zinc-500">{note}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GamePage() {
  const session = useSession();
  const onboarded = !!session?.profile && !!session?.result;
  // The game is a normal step for everyone (docs/RISK_GAME_BLEND.md): it only needs the profile on file.
  const profileStatus: ProfileStatus = session === null ? "loading" : !session.profile ? "missing" : "ready";
  const [started, setStarted] = useState(false);
  // What the game did to the category once it was scored in: the change, "pending" while it runs, "failed" if it could not.
  const [scored, setScored] = useState<CategoryChange | "pending" | "failed" | null>(null);
  const [balance,       setBalance]       = useState(STARTING_BALANCE);
  const [round,         setRound]         = useState(1);
  // Browser only: the prerender must not call Math.random (it renders nothing until the session loads).
  const [cards,         setCards]         = useState<Card[]>(() => (typeof window === "undefined" ? [] : generateCards()));
  const [selected,      setSelected]      = useState<Card | null>(null);
  const [phase,         setPhase]         = useState<Phase>("choosing");
  const [outcome,       setOutcome]        = useState<"win" | "lose" | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [history,       setHistory]       = useState<RoundRecord[]>([]);
  const [crash,         setCrash]         = useState<CrashTestResult | null>(null);

  // Accumulates total rotation so each spin continues from where the last stopped
  const rotationRef = useRef(0);

  // No Next button: the outcome stays on screen for RESULT_MS, then the next round is dealt
  // (or the results open). Clicking the overlay skips the wait.
  useEffect(() => {
    if (phase !== "result") return;
    const timer = setTimeout(advance, RESULT_MS);
    return () => clearTimeout(timer);
  });

  // Keys while choosing: 1-5 pick a card, Enter reveals the picked one (re-subscribed every render: latest state).
  useEffect(() => {
    if (phase !== "choosing" || profileStatus !== "ready") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const pickAt = Number(event.key) - 1;
      if (Number.isInteger(pickAt) && pickAt >= 0 && pickAt < cards.length) {
        setSelected(cards[pickAt]);
      } else if (event.key === "Enter" && selected && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        reveal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Profile gate ──
  if (profileStatus === "loading") return <PageLoader label="Loading the Risk Game" />;

  if (profileStatus === "missing") {
    return (
      <main className="flex h-screen overflow-hidden bg-white">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b-2 border-zinc-900 py-4 pl-6 pr-20 md:px-12">
            <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">Risk Game</h1>
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
              Revealed Preference
            </span>
          </div>
          <div className="flex flex-1 flex-col justify-center px-6 max-w-lg md:px-12">
            <p className="font-heading text-5xl leading-[1.1] text-zinc-900">
              Complete your<br />profile first.
            </p>
            <div className="my-8 h-px bg-zinc-300" />
            <p className="text-base leading-relaxed text-zinc-600 mb-10">
              The Risk Game counts one third of your attitude to risk, so your questionnaire answers must be on file before it can be scored.
            </p>
            <Link
              href="/questionnaire"
              className="self-start border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900"
            >
              Start Risk Profile →
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!started) {
    const state = gameState(session);
    return (
      <main className="flex h-screen overflow-hidden bg-white">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b-2 border-zinc-900 py-4 pl-12 pr-20 md:px-12">
            <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">Risk Game</h1>
            <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
              Revealed Preference
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-12">
            <div className="flex min-h-full max-w-xl flex-col justify-center">
              <p className="eq-rise font-heading text-4xl leading-[1.1] text-zinc-900 md:text-5xl">
                {state === "played" ? <>Play it<br />again?</> : <>Your Risk<br />Game.</>}
              </p>
              <div className="eq-rule my-8 h-px bg-zinc-300" />
              {state === "played" ? (
                <>
                  <p className="max-w-xl text-base leading-relaxed text-zinc-600">
                    You have played already. Playing again replaces that result, and your category is worked out again.
                  </p>
                  <CategoryLine basis={session?.profile ? basisOfProfile(session.profile) : null} className="mt-4" />
                  <div className="mt-8">
                    <button type="button" onClick={() => setStarted(true)}
                            className="border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900">
                      Play again <span className="eq-arrow">→</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {state === "skipped" && (
                    <p className="mb-4 max-w-xl border-l-4 border-zinc-900 pl-5 text-sm leading-relaxed text-zinc-700">
                      You skipped it, so your category rests on the questionnaire alone. You can still play it now.
                    </p>
                  )}
                  <GameInvite onPlay={() => setStarted(true)} onSkipped={() => undefined} />
                </>
              )}
              <p className="mt-8 max-w-xl text-xs leading-relaxed text-zinc-400">
                {state === "played" ? GAME_PITCH : "Hypothetical money, no real stakes. Your choices are scored as a tolerance for risk and how you react to a loss."}
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  function reveal() {
    if (!selected || phase !== "choosing") return;

    const result: "win" | "lose" = Math.random() < selected.winChance ? "win" : "lose";
    const target = targetRotation(rotationRef.current, result, selected.winChance);
    rotationRef.current = target;

    setOutcome(result);
    setWheelRotation(target);
    setPhase("spinning");
  }

  function onSpinEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.propertyName !== "transform" || phase !== "spinning") return;

    const delta      = outcome === "win" ? selected!.winAmount : -selected!.loseAmount;
    const newBalance = Math.max(0, balance + delta);
    const rank       = getRiskRank(selected!, cards);

    setBalance(newBalance);
    setHistory((prev) => [
      ...prev,
      { riskRank: rank, outcome: outcome!, significant: selected!.loseAmount >= 100 },
    ]);
    setPhase("result");
  }

  function advance() {
    const isLast = round >= TOTAL_ROUNDS || balance === 0;
    if (isLast) {
      // The Crash Test is the last step; the result is saved when it ends.
      setPhase("crash");
    } else {
      setRound((r) => r + 1);
      setCards(generateCards());
      setSelected(null);
      setOutcome(null);
      setPhase("choosing");
    }
  }

  function finishCrashTest(result: CrashTestResult) {
    // Keep the result for later steps; saveSession({}) also copies it to the account.
    try {
      localStorage.setItem("eq_game_result", JSON.stringify({
        ...computeScores(history), finalBalance: balance, rounds: history.length,
        crashTest: result, completedAt: new Date().toISOString(),
      }));
      saveSession({});
    } catch {
      // storage blocked: the result is still shown on this screen
    }
    setCrash(result);
    setPhase("done");
    // The game is part of the category: score the profile again and check the investments chosen earlier against it.
    const now = currentSession();
    if (now?.answers) {
      setScored("pending");
      applyGame(now).then(setScored).catch(() => setScored("failed"));
    }
  }

  const scores  = computeScores(history);
  const winDeg  = selected ? selected.winChance * 360 : 180;
  const isLast  = round >= TOTAL_ROUNDS || balance === 0;

  return (
    <main className="flex h-screen overflow-hidden bg-white">
      <Sidebar />

      <div className="relative flex flex-1 flex-col overflow-hidden">
        {/* ── Top bar ── */}
        <div className="flex shrink-0 items-center justify-between border-b-2 border-zinc-900 py-4 pl-6 pr-20 md:px-12">
          <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">
            {phase === "done"
              ? "Behavioural Assessment"
              : phase === "crash"
              ? "Risk Game · Crash Test"
              : `Risk Game · Round ${round} of ${TOTAL_ROUNDS}`}
          </h1>
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
            Revealed Preference
          </span>
        </div>
        {phase !== "done" && phase !== "crash" && round === 1 && <StepReminder step="game" />}

        {/* ── Crash Test: the last step ── */}
        {phase === "crash" ? (
          <CrashTest onDone={finishCrashTest} />

        /* ── Results screen ── */
        ) : phase === "done" ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 content-start gap-8 overflow-y-auto px-6 py-8 md:grid-cols-2 md:content-normal md:gap-16 md:overflow-hidden md:px-12 md:py-10 short:md:py-6">
            <div className="flex flex-col md:min-h-0 md:justify-center">
              <p className="eq-rise font-heading text-5xl leading-[1.1] text-zinc-900">
                Assessment<br />complete.
              </p>
              <div className="eq-rule my-8 h-px bg-zinc-300" />

              <div className="eq-rise flex flex-col gap-6" style={{ "--eq-d": "200ms" } as CSSProperties}>
                <ScoreBar
                  label="Attitude to risk"
                  score={scores.tolerance}
                  note={
                    scores.tolerance > 66
                      ? "You consistently favoured low-probability, high-reward options."
                      : scores.tolerance > 33
                      ? "You balanced risk and security across the session."
                      : "You prioritised capital preservation over expected gains."
                  }
                />
                <ScoreBar
                  label="Loss Acceptance"
                  score={scores.lossAcceptance}
                  note={
                    scores.lossAcceptance > 66
                      ? "Losses did not change your risk appetite in subsequent rounds."
                      : scores.lossAcceptance > 33
                      ? "Losses moderately shifted your selections toward safety."
                      : "After losses, you consistently chose more conservative options."
                  }
                />
              </div>
            </div>

            <div className="eq-rise flex flex-col gap-4 md:min-h-0 md:justify-center" style={{ "--eq-d": "320ms" } as CSSProperties}>
              <div className="border border-zinc-200 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">
                  Final Balance
                </p>
                <p className="font-heading text-4xl text-zinc-900">
                  ${balance.toLocaleString()}
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  {balance >= STARTING_BALANCE ? "+" : ""}
                  {(balance - STARTING_BALANCE).toLocaleString()} from ${STARTING_BALANCE.toLocaleString()} start
                </p>
              </div>

              {crash && (
                <div className="border border-zinc-200 p-5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">
                    Crash Test
                  </p>
                  <p className="text-sm leading-relaxed text-zinc-700">
                    {crash.sold_at_drawdown === null
                      ? `You held on through a fall of ${Math.round(crash.max_drawdown_seen * 100)}% from the fund's high.`
                      : `You first sold when the fund was ${Math.round(crash.sold_at_drawdown * 100)}% below its high, ` +
                        `and sold ${Math.round(crash.sold_fraction * 100)}% of it in total.`}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">Hypothetical market path, not a forecast.</p>
                </div>
              )}

              <div className="border-2 border-zinc-900 p-5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-2">
                  Your risk category
                </p>
                {scored === null || scored === "pending" ? (
                  <p role="status" className="animate-pulse text-sm text-zinc-500">Working out your category…</p>
                ) : scored === "failed" ? (
                  <p role="status" className="text-sm leading-relaxed text-zinc-700">
                    We could not update your category just now. It is worked out again, with this game, when you build your portfolio.
                  </p>
                ) : (
                  <>
                    <p className="font-heading text-4xl leading-none text-zinc-900">
                      {scored.after.c_level}
                      <span className="ml-3 font-sans text-sm text-zinc-400">
                        {scored.before && scored.before !== scored.after.c_level ? `was ${scored.before}` : "unchanged"}
                      </span>
                    </p>
                    <CategoryLine basis={basisOfProfile(scored.after)} className="mt-2" />
                    <p className="mt-3 text-sm leading-relaxed text-zinc-500">
                      {scored.after.no_loss_gate
                        ? "You said you could not accept any loss, so your category stays C1 whatever the game shows. The result is kept with your profile."
                        : "The game counts one third of your attitude to risk and the questionnaire two thirds. A cautious game can lower your category and a bold one can raise it, never above the cap your finances set."}
                    </p>
                    {interestsNotice(scored) && (
                      <p role="status" className="mt-3 border-l-4 border-zinc-900 pl-4 text-sm leading-relaxed text-zinc-900">
                        {interestsNotice(scored)}
                      </p>
                    )}
                  </>
                )}
              </div>

              <Link
                href={scored && typeof scored === "object" && scored.interestsChanged ? "/interests"
                  : !session?.interests ? "/interests" : onboarded ? "/" : "/portfolio"}
                className="mt-4 self-start border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900"
              >
                {scored && typeof scored === "object" && scored.interestsChanged ? "Choose Investments again"
                  : !session?.interests ? "Choose Investments" : onboarded ? "Back to Home" : "Build Portfolio"} <span className="eq-arrow">→</span>
              </Link>
            </div>
          </div>

        ) : (
          /* ── Game screen ── */
          <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-6 py-6 md:overflow-hidden md:px-12 md:py-8">

            {/* Balance + progress */}
            <div className="mb-8 flex items-end justify-between gap-4 short:mb-4">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                  Current Balance
                </p>
                <p className="font-heading text-4xl leading-none text-zinc-900 md:text-5xl">
                  ${balance.toLocaleString()}
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 w-4 rounded-full transition-colors sm:w-7 ${
                      i < round - 1
                        ? "bg-zinc-900"
                        : i === round - 1
                        ? "bg-zinc-400"
                        : "bg-zinc-100"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Instruction */}
            <p className="mb-1 text-sm text-zinc-500">
              Pick a card, then reveal the outcome: tap it again or press Enter.
            </p>
            <p className="mb-7 text-xs text-zinc-400 short:mb-4">
              All options carry equal expected value (EV = 0). Your choice is the signal.
            </p>

            {/* Card grid */}
            <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 md:gap-4 short:mb-4">
              {cards.map((card, i) => {
                const active = selected?.id === card.id;
                return (
                  <button
                    key={card.id}
                    onClick={() => { if (phase !== "choosing") return; if (active) reveal(); else setSelected(card); }}
                    disabled={phase !== "choosing"}
                    aria-pressed={active}
                    aria-keyshortcuts={String(i + 1)}
                    className={`flex flex-col items-center gap-3 rounded-none border-2 p-3 text-center transition-all md:p-5 short:gap-2 short:p-3 ${
                      active
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-500"
                    }`}
                  >
                    <ProbabilityArc winChance={card.winChance} active={active} />

                    <span className={`text-[10px] font-semibold uppercase tracking-widest ${active ? "text-zinc-400" : "text-zinc-400"}`}>
                      {card.label}
                    </span>

                    <div className="flex flex-col gap-1">
                      <span className={`text-base font-bold ${active ? "text-white" : "text-zinc-900"}`}>
                        +${card.winAmount}
                      </span>
                      <span className={`text-sm ${active ? "text-zinc-400" : "text-zinc-400"}`}>
                        −${card.loseAmount}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Reveal button */}
            {selected && phase === "choosing" && (
              <button
                key={selected.id}
                onClick={reveal}
                className="eq-rise self-start border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900"
              >
                Reveal Outcome <span className="eq-arrow">→</span>
              </button>
            )}
          </div>
        )}

        {/* ── Spin modal (always in DOM so CSS transition fires correctly) ── */}
        <div
          onClick={() => { if (phase === "result") advance(); }}
          className={`fixed inset-0 z-50 flex items-center justify-center bg-white/95 transition-opacity duration-300 ${
            phase === "spinning" || phase === "result"
              ? "opacity-100"
              : "opacity-0 pointer-events-none"
          }`}
        >
          {selected && (
            <div className="flex flex-col items-center gap-10">
              <p className="font-heading text-2xl italic text-zinc-500">
                {phase === "spinning"
                  ? "Spinning…"
                  : outcome === "win"
                  ? "You won."
                  : "You lost."}
              </p>

              {/* Wheel */}
              <div className="relative">
                {/* Pointer triangle at top */}
                <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-3">
                  <div className="h-0 w-0 border-b-[20px] border-l-[10px] border-r-[10px] border-b-zinc-900 border-l-transparent border-r-transparent" />
                </div>

                {/* Spinning disc: dark = win sector (from top), light = lose sector */}
                <div
                  className="h-64 w-64 rounded-full border-4 border-zinc-900"
                  style={{
                    background: `conic-gradient(#18181b 0deg ${winDeg}deg, #e4e4e7 ${winDeg}deg 360deg)`,
                    transform: `rotate(${wheelRotation}deg)`,
                    transition: phase === "spinning" ? "transform 3.5s ease-out" : "none",
                  }}
                  onTransitionEnd={onSpinEnd}
                />

                {/* Centre cap */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="h-10 w-10 rounded-full border-4 border-zinc-900 bg-white" />
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-6 text-xs text-zinc-400">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-zinc-900" /> Win ({Math.round(selected.winChance * 100)}%)
                </span>
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-sm bg-zinc-200 border border-zinc-300" /> Lose ({Math.round((1 - selected.winChance) * 100)}%)
                </span>
              </div>

              {/* Result */}
              {phase === "result" && (
                <div className="flex flex-col items-center gap-6">
                  <p className={`font-heading text-5xl leading-none ${outcome === "win" ? "text-zinc-900" : "text-zinc-400"}`}>
                    {outcome === "win" ? `+$${selected.winAmount}` : `−$${selected.loseAmount}`}
                  </p>
                  <div className="flex w-48 flex-col items-center gap-2">
                    <div className="h-0.5 w-full bg-zinc-100">
                      <div key={round} className="eq-countdown h-full bg-zinc-900" style={{ "--eq-t": `${RESULT_MS}ms` } as CSSProperties} />
                    </div>
                    <p className="text-xs text-zinc-400">
                      {isLast ? "Your results are next" : `Round ${round + 1} is next`} · click to skip
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
