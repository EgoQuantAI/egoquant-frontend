"use client";

import Link from "next/link";
import { useState } from "react";
import { skipRiskGame, useSession } from "@/lib/egoquant";

// The invitation to the Risk Game, the same wherever it appears: what it is, how long it takes, what it does for the person.
// "Skip" is there and visible, and asks first: a skipped game means the category rests on the questionnaire alone.

const primary =
  "border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900";
const quiet = "text-sm font-semibold text-zinc-500 underline hover:text-zinc-900";

export const GAME_PITCH =
  "A short game (about 2 minutes) that shows how you really choose when money is at stake. It counts one third of your attitude " +
  "to risk, so the result fits you and not only your answers.";

/** Someone who said they could not accept any loss is in C1 whatever the game shows: the invitation must not promise a change. */
export const GATE_PITCH =
  "A short game (about 2 minutes) that shows how you really choose when money is at stake. You said you could not accept any loss, " +
  "so your category stays C1 whatever the game shows. You can still play it, or skip it.";

export function GameInvite({ onPlay, onSkipped, className = "" }: {
  onPlay?: () => void;                // on the game page itself: start; elsewhere a link to /game
  onSkipped: () => void;              // called after the skip was confirmed and stored
  className?: string;
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const gate = useSession()?.profile?.no_loss_gate === true;

  function confirmSkip() {
    if (!skipRiskGame()) return setError("Your browser blocked saving that. Allow site storage and retry.");
    onSkipped();
  }

  return (
    <div className={className}>
      <p className="max-w-xl text-base leading-relaxed text-zinc-600">{gate ? GATE_PITCH : GAME_PITCH}</p>
      <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
        {onPlay ? (
          <button type="button" onClick={onPlay} className={primary}>Play the Risk Game <span className="eq-arrow">→</span></button>
        ) : (
          <Link href="/game" className={primary}>Play the Risk Game <span className="eq-arrow">→</span></Link>
        )}
        {!asking && <button type="button" onClick={() => setAsking(true)} className={quiet}>Skip</button>}
      </div>
      {asking && (
        <div role="group" aria-label="Skip the Risk Game" className="mt-6 max-w-xl border-l-4 border-zinc-900 pl-5">
          <p className="text-sm leading-relaxed text-zinc-900">
            {gate ? "Skip the Risk Game? Your category stays C1 either way." : "Skip the Risk Game? Your category will rest on the questionnaire alone."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
            <button type="button" onClick={confirmSkip}
                    className="border-2 border-zinc-900 px-5 py-2 text-xs font-semibold uppercase tracking-widest text-zinc-900 hover:bg-zinc-900 hover:text-white">
              Yes, skip it
            </button>
            <button type="button" onClick={() => setAsking(false)} className={quiet}>No, go back</button>
          </div>
          {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
