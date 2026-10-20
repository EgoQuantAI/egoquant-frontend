"use client";

import { type CSSProperties, useSyncExternalStore } from "react";
import { type Session, gameState } from "@/lib/egoquant";

// Onboarding helpers: the play-along agreement on the welcome screen, a short reminder at the top of
// each step, and the step progress the sidebar shows. Flags live in localStorage under their own keys,
// apart from the session, so retaking the profile does not ask for the agreement again.

const PREFIX = "egoquant.onboarding.";
const EVENT = "egoquant-onboarding";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readFlag(name: string): boolean {
  try {
    return window.localStorage.getItem(PREFIX + name) === "1";
  } catch {
    return false;
  }
}

function setFlag(name: string) {
  try {
    window.localStorage.setItem(PREFIX + name, "1");
  } catch {
    // Storage blocked: the flag lasts until the next reload, which is fine for a reminder.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** A stored yes/no flag; null while prerendering and hydrating, so nothing flashes in or out. */
export function useFlag(name: string): [boolean | null, () => void] {
  const value = useSyncExternalStore(subscribe, () => readFlag(name), () => null);
  return [value, () => setFlag(name)];
}

// ─── Play-along agreement ───────────────────────────────────────────────────

const RULES = [
  {
    title: "Pretend it is your real money.",
    text: "Enter the savings, goal and deadline you would really have. Make the numbers up if you like, but keep them believable and consistent with each other.",
  },
  {
    title: "Answer on instinct.",
    text: "There are no right answers. The questionnaire is a validated scale, and it notices when answers contradict each other.",
  },
  {
    title: "Nothing here is real.",
    text: "EgoQuant is a hackathon prototype. No account is opened, no money moves, and nothing you see is financial advice.",
  },
];

export function PlayAlongAgreement({ agreed, onAgree }: { agreed: boolean; onAgree: () => void }) {
  return (
    <div className="mb-10 eq-rise" style={{ "--eq-d": "260ms" } as CSSProperties}>
      <p className="mb-4 font-heading text-2xl text-zinc-900">Before you start</p>
      <ol className="mb-6 flex flex-col gap-4">
        {RULES.map((rule, i) => (
          <li key={rule.title} className="flex gap-4">
            <span className="w-4 shrink-0 font-heading text-xl leading-6 text-zinc-400">{i + 1}</span>
            <span>
              <span className="block text-sm font-semibold text-zinc-900">{rule.title}</span>
              <span className="block text-sm leading-relaxed text-zinc-500">{rule.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <label className="flex cursor-pointer items-center gap-3 border-l-4 border-zinc-900 py-2 pl-5 text-sm text-zinc-900">
        <input
          type="checkbox"
          checked={agreed}
          disabled={agreed}
          onChange={onAgree}
          className="h-4 w-4 accent-zinc-900"
        />
        I will answer as if this were my own money.
      </label>
    </div>
  );
}

// ─── Step reminder ──────────────────────────────────────────────────────────

const REMINDERS: Record<string, string> = {
  questionnaire:
    "Answer as if you were sitting with a real adviser and these were your real savings. Honest answers give a profile that actually fits you.",
  interests:
    "Pick what you would really want to own, not what sounds impressive. We only fetch prices for what you choose.",
  game:
    "Play as if the money were yours. Always taking the safest card, or always the riskiest, tells us as much as anything in between. It counts one third of your attitude to risk.",
  portfolio:
    "Enter the goal you would really aim for. The chance of reaching it is worked out from these numbers, so keep them believable.",
};

/** A one-line play-along reminder under the top bar; dismissed per step. */
export function StepReminder({ step }: { step: keyof typeof REMINDERS }) {
  const [dismissed, dismiss] = useFlag(`reminder.${step}`);
  if (dismissed !== false) return null;
  return (
    <div className="eq-rise flex shrink-0 items-start justify-between gap-6 border-b border-zinc-200 bg-zinc-50 px-6 py-3 md:px-12">
      <p className="text-sm leading-relaxed text-zinc-700">
        <span className="font-semibold text-zinc-900">Play along. </span>
        {REMINDERS[step]}
      </p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 text-xs font-semibold uppercase tracking-widest text-zinc-400 hover:text-zinc-900"
      >
        Got it
      </button>
    </div>
  );
}

// ─── Progress ───────────────────────────────────────────────────────────────

export type StepState = "done" | "current" | "todo";

// The Review step is finished once the person ends it ("Finish" on /review) for THIS portfolio: the flag holds the
// build time it was reviewed at, so a rebuilt portfolio (or someone else's in this browser) is not "done".
const REVIEWED = `${PREFIX}reviewed`;

export function markReviewed(builtAt: string | undefined) {
  try {
    window.localStorage.setItem(REVIEWED, builtAt ?? "");
  } catch {
    // storage blocked: the sidebar keeps showing Review as the current step
  }
  window.dispatchEvent(new Event(EVENT));
}

function reviewed(session: Session | null): boolean {
  if (typeof window === "undefined" || !session?.result || !session.builtAt) return false;
  try {
    return window.localStorage.getItem(REVIEWED) === session.builtAt;
  } catch {
    return false;
  }
}

/** Which onboarding steps are finished, from the saved session. The first unfinished one is current. */
export function onboardingSteps(session: Session | null): Record<string, StepState> {
  const profile = session?.profile;
  const finished: Record<string, boolean> = {
    profile: !!profile,
    interests: !!session?.interests,
    game: !!profile && gameState(session) !== "none",       // played, or skipped on purpose (an old result still counts as seen)
    portfolio: !!session?.result,
    review: reviewed(session),
  };
  const order = ["profile", "game", "interests", "portfolio", "review"];
  const current = order.find((id) => !finished[id]);
  return Object.fromEntries(
    order.map((id) => [id, finished[id] ? "done" : id === current ? "current" : "todo"]),
  ) as Record<string, StepState>;
}
