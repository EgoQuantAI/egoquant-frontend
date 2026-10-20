// The investor's IBKR trading history, for Agent B. Held in memory only: never in localStorage, never in
// the saved session, never logged. A page reload forgets it, and so does "Forget it" in the panel.
// A Flex token is checked first (components/ibkr-panel.tsx), then dropped as soon as the request that used it has
// finished: it fetches the report twice at most, and is never stored.

export const IBKR_MAX_BYTES = 2_000_000;   // the backend takes at most 2 MB of report text (behavioral/ibkr.py MAX_BYTES)

export type IbkrInput =
  | { kind: "report"; text: string; filename: string }
  | { kind: "flex"; token: string; queryId: string };

let current: IbkrInput | null = null;

export function getIbkr(): IbkrInput | null {
  return current;
}

export function setIbkr(input: IbkrInput | null) {
  current = input;
}

/** The /portfolio body fields for what is held now: `ibkr_report`, or `ibkr_flex`, or nothing. Never both. */
export function ibkrFields(): { ibkr_report?: string; ibkr_flex?: { token: string; query_id: string } } {
  if (!current) return {};
  if (current.kind === "report") return { ibkr_report: current.text };
  return { ibkr_flex: { token: current.token, query_id: current.queryId } };
}

/** Called after every build, successful or not: a token is never kept past the request that used it. */
export function dropIbkrToken() {
  if (current?.kind === "flex") current = null;
}
