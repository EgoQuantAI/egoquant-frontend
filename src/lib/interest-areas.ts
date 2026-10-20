import { INTEREST_AREA_LIMIT } from "@/lib/build-timing";

// The interest areas a person's answers lead to (backend POST /preferences/areas): the areas in the order the build uses
// them. Only the first `limit` get prices and news; the rest are skipped. Everything is optional and checked: an answer that
// is not in this shape, or an older backend without the route, simply shows nothing.

export type AreaPlan = { areas: string[]; limit: number };

/** The checked plan, or null when the answer is not usable. */
export function parseAreaPlan(raw: unknown): AreaPlan | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.areas) || !r.areas.every((a) => typeof a === "string" && a.length > 0 && a.length < 60)) return null;
  const limit = typeof r.limit === "number" && Number.isInteger(r.limit) && r.limit >= 1 && r.limit <= 100 ? r.limit : INTEREST_AREA_LIMIT;
  return { areas: [...new Set(r.areas as string[])], limit };
}

/** "x of 8": how many areas are chosen against how many are used. `used` never exceeds the limit. */
export function areaCount(plan: AreaPlan): { chosen: number; used: number; limit: number; over: boolean } {
  const chosen = plan.areas.length;
  return { chosen, used: Math.min(chosen, plan.limit), limit: plan.limit, over: chosen > plan.limit };
}

/** The areas that will get prices and news, and the ones that will be skipped, in the order the build uses them. */
export function splitAreas(plan: AreaPlan): { used: string[]; skipped: string[] } {
  return { used: plan.areas.slice(0, plan.limit), skipped: plan.areas.slice(plan.limit) };
}

/** "us_stocks" -> "U.S. stocks" (a name from the questions wins when there is one). */
export function areaName(id: string, names?: Record<string, string>): string {
  const known = names && Object.hasOwn(names, id) ? names[id] : null;
  if (known) return known;
  const text = id.replace(/_/g, " ").replace(/^us\b/i, "U.S.");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** "Gold, Crypto and Altcoins" */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The note shown once more areas are chosen than are used. Calm; says what is skipped and what helps. */
export function overNote(plan: AreaPlan, names?: Record<string, string>): string | null {
  const { skipped } = splitAreas(plan);
  if (!skipped.length) return null;
  return `Only the first ${plan.limit} are used for prices and news, so ${joinNames(skipped.map((a) => areaName(a, names)))} ` +
    `${skipped.length === 1 ? "is" : "are"} left out. The order is fixed, broad areas before specific ones; to include one that is left out, choose fewer areas.`;
}
