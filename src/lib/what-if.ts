// What-if results from the advisor chat (backend: egoquant/agents/what_if.py, returned by /chat as `what_if`)
// and the per-session privacy tally (counts of values the backend hid from the AI; never the values).
// Every number in a WhatIfResult is computed by the engine; the page only lays it out.

export type WhatIfOutcome = {
  goal_frequency: number | null;     // "X in 100"
  goal_chance: string | null;
  median_final: number;
  p5_final: number;
  drawdown_p95: number;
};

export type WhatIfResult = {
  status: "ok" | "blocked" | "invalid" | "unavailable";
  reason?: string | null;
  scenario_text?: string | null;
  baseline_goal_frequency?: number | null;
  scenario_goal_frequency?: number | null;
  baseline?: WhatIfOutcome | null;
  scenario_outcome?: WhatIfOutcome | null;
  goal_amount?: number | null;
  horizon_years?: number | null;
  portfolio_changed?: boolean;
  new_weights?: Record<string, number> | null;
  risk_engine?: { approved: boolean; reasons: string[] } | null;
  n_paths?: number | null;
  label?: string;
};

export type PrivacyCounts = { hidden: number; by_kind: Record<string, number> };

const SESSION_KEY = "egoquant.advisor.session.v1";
const PRIVACY_KEY = "egoquant.advisor.privacy.v1";

/** A random id for this tab's chat session (privacy counts are kept per session). */
export function chatSessionId(): string | null {
  try {
    let id = window.sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function readPrivacy(): number {
  try {
    const n = Number(window.sessionStorage.getItem(PRIVACY_KEY) || "0");
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Add one reply's count; returns the session total. */
export function addPrivacy(privacy: PrivacyCounts | null | undefined): number {
  const total = readPrivacy() + (privacy && Number.isFinite(privacy.hidden) && privacy.hidden > 0 ? privacy.hidden : 0);
  try {
    window.sessionStorage.setItem(PRIVACY_KEY, String(total));
  } catch {
    // storage blocked: the indicator shows this page view only
  }
  return total;
}

/** Only well-formed results from the server are rendered. */
export function whatIfList(value: unknown): WhatIfResult[] {
  return Array.isArray(value)
    ? value.filter((r): r is WhatIfResult => !!r && typeof r === "object" && typeof (r as WhatIfResult).status === "string")
    : [];
}
