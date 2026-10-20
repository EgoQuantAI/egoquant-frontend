// An unfinished questionnaire survives a refresh, a closed tab or a crashed browser: the answers so far and the screen they
// were on are kept in THIS browser (the finished answers are kept here too, lib/egoquant.ts). The account holds the profile
// once the questionnaire is scored, not the half-answered one. The draft is dropped when the profile is scored, when the
// person starts over, and with the rest of the local copy (clearLocal: another person signs in, sign-out, "Delete my data").

export const DRAFT_KEY = "egoquant.questionnaire.draft.v1";

export type DraftAnswers = Record<string, string | string[]>;
export type DraftStage = { type: "section_intro"; sectionId: string } | { type: "question"; index: number };
export type Draft = { version: string; answers: DraftAnswers; stage: DraftStage };

/** The draft saved for this version of the question bank, or null (none, another version, or damaged). */
export function loadDraft(version: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft> | null;
    if (!d || d.version !== version || !d.answers || typeof d.answers !== "object" || !d.stage) return null;
    return { version, answers: d.answers, stage: d.stage };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // storage blocked: the questionnaire still works, it just cannot be picked up again
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // nothing stored
  }
}
