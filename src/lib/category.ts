import type { GameState, Profile } from "@/lib/egoquant";

// How the risk category was set, in one line (docs/RISK_GAME_BLEND.md): the questionnaire's tolerance level, the game's level
// and the blend of the two when a game was played, and the capacity cap; the category is the lowest of the cap and the blend.
// Parts that do not exist are left out.

export type CategoryBasis = {
  c_level: string;
  questionnaire_level: number;
  capacity_level: number;
  game_level?: number | null;
  blended_level?: number | null;
  no_loss_gate?: boolean;
};

const level = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 5 ? x : null);

/** The checked basis from a profile, or from the report's own `risk_basis` (anything odd gives null). */
export function parseBasis(raw: unknown): CategoryBasis | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const q = level(r.questionnaire_level ?? r.tolerance_level);
  const cap = level(r.capacity_level);
  const c = typeof r.c_level === "string" && /^C[1-5]$/.test(r.c_level) ? r.c_level : null;
  if (q === null || cap === null || c === null) return null;
  return {
    c_level: c, questionnaire_level: q, capacity_level: cap, game_level: level(r.game_level), blended_level: level(r.blended_level),
    no_loss_gate: r.no_loss_gate === true,
  };
}

export const basisOfProfile = (profile: Profile): CategoryBasis | null => parseBasis(profile);

/** "Questionnaire level 4, game level 2, combined 3, capacity cap 4: C3" */
export function categoryText(b: CategoryBasis): string {
  if (b.no_loss_gate) return `You said you could not accept any loss: ${b.c_level}`;
  const parts = [
    `Questionnaire level ${b.questionnaire_level}`,
    b.game_level ? `game level ${b.game_level}` : null,
    b.game_level && b.blended_level ? `combined ${b.blended_level}` : null,
    `capacity cap ${b.capacity_level}`,
  ].filter(Boolean);
  return `${parts.join(", ")}: ${b.c_level}`;
}

/** The engine's own sentence on how the category was set (`report.category_basis.text`; present only when a game was played). */
export function basisSentence(report: { category_basis?: { text?: unknown } | null }): string | null {
  const text = report.category_basis?.text;
  return typeof text === "string" && text.trim() && text.length <= 500 ? text.trim() : null;
}

/** The sentence about the game when it is not part of the category (nothing when it is). */
export function gameNote(state: GameState): { text: string; action: string } | null {
  switch (state) {
    case "played": return null;
    case "skipped": return { text: "Risk Game: skipped, so your category rests on the questionnaire alone.", action: "Play it after all" };
    default: return { text: "Risk Game: not played.", action: "Play it (about 2 minutes)" };
  }
}
