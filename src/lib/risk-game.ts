import { useEffect, useState } from "react";
import {
  type Answers, type Interests, type PreferenceForm, type Profile, type RiskGame, type Session,
  answersWithGame, callApi, gameState, saveSession,
} from "@/lib/egoquant";
import { recheckChoices } from "@/lib/interest-choices";

// The Risk Game inside the risk category (docs/RISK_GAME_BLEND.md): after a game is played, replayed or too old to count,
// the profile is scored again by the backend and the investments chosen earlier are checked against the new category.

const JSON_HEADERS = { "Content-Type": "application/json" };

/** The questionnaire answers scored again with the game (the backend does the blend; this only asks). */
export function rescoreProfile(answers: Answers, game: RiskGame | null | undefined): Promise<Profile> {
  return callApi<Profile>("/api/profile", {
    method: "POST", headers: JSON_HEADERS, body: JSON.stringify(answersWithGame(answers, game)), timeoutMs: 35_000,
  });
}

/** The preference form for this profile, built for the category the answers (with the game) lead to. */
export function preferenceForm(answers: Answers, game: RiskGame | null | undefined, platforms: string[]): Promise<PreferenceForm> {
  return callApi<PreferenceForm>("/api/preferences", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({ answers: answersWithGame(answers, game), trading_platforms: platforms }), timeoutMs: 30_000,
  });
}

export type CategoryChange = {
  before: string | undefined;     // the category before ("C4")
  after: Profile;                 // the profile as scored now
  removed: string[];              // investments chosen earlier that the new category does not allow
  interestsChanged: boolean;      // the saved choices were trimmed (or cleared): the person has to look at them again
};

/**
 * Score the profile again with the game as it stands now, store it, and trim the saved investment choices to what the
 * new category allows (a backend refuses a choice that is not offered, so a stale one must not stay). Trimmed choices
 * make an earlier portfolio stale, so it is dropped, as it is whenever the investments change.
 */
export async function applyGame(session: Session): Promise<CategoryChange> {
  if (!session.answers) throw new Error("There are no questionnaire answers to score.");
  const after = await rescoreProfile(session.answers, session.riskGame);
  let removed: string[] = [];
  let interestsChanged = false;
  let interests: Interests | undefined = session.interests;
  if (session.interests && "preferences" in session.interests) {
    const form = await preferenceForm(session.answers, session.riskGame, session.interests.trading_platforms);
    const check = recheckChoices(form, session.interests);
    removed = check.removed;
    interestsChanged = check.changed;
    interests = check.interests;
  }
  saveSession({ profile: after, ...(interestsChanged ? { interests, result: undefined } : {}) });
  return { before: session.profile?.c_level, after, removed, interestsChanged };
}

// A page that finds a profile scored without the game it now has (an older session) scores it again once per game result,
// so a backend without the new fields cannot make it loop.
const tried = new Set<string>();

/** Whether the saved profile was scored without a game that exists now: it should be scored again. */
export function profileIsStale(session: Session | null | undefined): boolean {
  return !!session?.profile && !!session.answers && gameState(session) === "played" && !session.profile.game_played;
}

/** One try per game result for this page load. */
export function claimRescore(session: Session): boolean {
  const key = `${session.riskGame?.completedAt ?? "none"}:${gameState(session)}`;
  if (tried.has(key)) return false;
  tried.add(key);
  return true;
}

/** On a page that depends on the category: score a stale profile again, once per game result. Returns what that changed. */
export function useFreshProfile(session: Session | null): CategoryChange | null {
  const [change, setChange] = useState<CategoryChange | null>(null);
  useEffect(() => {
    if (!session || !profileIsStale(session) || !claimRescore(session)) return;
    applyGame(session).then(setChange).catch(() => undefined);      // the page keeps working with the profile it has
  }, [session]);
  return change;
}

/** The plain sentence for investments chosen earlier that a new category does not allow, or null when all of them stand. */
export function interestsNotice(change: CategoryChange): string | null {
  if (!change.interestsChanged) return null;
  const now = change.after.c_level;
  return change.removed.length
    ? `Your category is now ${now}, which does not include ${change.removed.join(", ")}. You had chosen ${change.removed.length === 1 ? "it" : "them"}, so please choose your investments again.`
    : `Some of the investments you chose do not fit your new category, ${now}. Please look at them again.`;
}
