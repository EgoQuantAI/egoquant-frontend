import { type Interests, type PreferenceForm, applies } from "@/lib/egoquant";

// The investment-type answers, and what a form (built for one risk category) lets stand of them.

export type Choices = Record<string, string[]>;

/** Questions the backend asks that are not shown: their answer is fixed. P7 (how to hold bonds) ends in bond funds
 *  either way (individual bonds cannot be priced), so its first option always stands. */
export const ASSUMED: Choices = { P7: ["funds"] };

/** Only answers that still apply and are still offered (a platform or category change can take options away). */
export function effective(form: PreferenceForm, choices: Choices): Choices {
  const out: Choices = {};
  for (const q of form.questions) {
    if (!applies(q, out)) continue;          // questions come in order, so requires refers to earlier ones
    const offered = new Set(q.options.filter((o) => o.available).map((o) => o.id));
    const picked = (ASSUMED[q.id] ?? choices[q.id] ?? []).filter((id) => offered.has(id));
    if (picked.length) out[q.id] = picked;
  }
  return out;
}

/** "Stocks (shares of companies, ...)" -> "Stocks" */
export function shortText(text: string): string {
  return text.split(" (")[0];
}

/** The short names of the first question's picked options (what the pages list as "your investments"). */
export function summaryOf(form: PreferenceForm, picked: Choices): string[] {
  const first = form.questions[0];
  if (!first) return [];
  return first.options.filter((o) => (picked[first.id] ?? []).includes(o.id)).map((o) => shortText(o.text));
}

/**
 * What a new form (for a new category) does to answers given earlier: the choices that still stand, the names of the
 * options that were chosen and are not offered any more (to tell the person), and the Interests to keep, or undefined
 * when nothing is left to keep (the person has to choose again). `changed` is false when everything stands.
 */
export function recheckChoices(form: PreferenceForm, interests: Interests): {
  interests: Interests | undefined; removed: string[]; changed: boolean;
} {
  const before = interests.preferences.choices;
  const picked = effective(form, before);
  const removed: string[] = [];
  for (const q of form.questions) {
    if (q.type !== "multi") continue;        // a single choice ("a mix of both") is a style, not a kind of investment to name
    for (const o of q.options) {
      if (!o.available && (before[q.id] ?? []).includes(o.id)) removed.push(shortText(o.text));
    }
  }
  const changed = JSON.stringify(picked) !== JSON.stringify(before);
  const first = form.questions[0];
  const stands = !!first && (picked[first.id] ?? []).length > 0;
  return {
    interests: changed
      ? stands ? { ...interests, preferences: { ...interests.preferences, choices: picked }, summary: summaryOf(form, picked) } : undefined
      : interests,
    removed: [...new Set(removed)],
    changed,
  };
}
