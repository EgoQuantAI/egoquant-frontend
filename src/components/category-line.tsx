"use client";

import Link from "next/link";
import { type CategoryBasis, categoryText, gameNote } from "@/lib/category";
import type { GameState } from "@/lib/egoquant";

// One line on how the category was set, and, when the Risk Game is not part of it, the invitation to play it.

export function CategoryLine({ basis, sentence, state, className = "" }: {
  basis: CategoryBasis | null;
  sentence?: string | null;    // the engine's own sentence from a built report; it wins over the line worked out from the profile
  state?: GameState;          // leave out where the game state is not known (a saved report states only its own basis)
  className?: string;
}) {
  const note = state ? gameNote(state) : null;
  const line = sentence ?? (basis ? categoryText(basis) : null);
  if (!line && !note) return null;
  return (
    <div className={`text-xs leading-relaxed text-zinc-500 ${className}`}>
      {line && <p>{line}</p>}
      {note && (
        <p className={line ? "mt-0.5" : ""}>
          {note.text}{" "}
          <Link href="/game" className="eq-tap font-semibold text-zinc-900 underline">{note.action}</Link>
        </p>
      )}
    </div>
  );
}
