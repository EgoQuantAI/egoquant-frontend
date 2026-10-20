// The deterministic trade check (egoquant/trade_check.py) as the API returns it. Every number and sentence is
// written by the backend; fractions are 0-1. The chat only phrases the verdict, it never decides it.

export type Verdict = "advisable" | "allowed_with_warnings" | "not_advisable";

export type TradeReason = {
  code: string;
  severity: "blocking" | "warning" | "info";
  message: string;
  source: string | null;
  limit: number | null;
  before: number | null;
  after: number | null;
  ticker: string | null;
  scenario: string | null;
};

export type PortfolioNumbers = {
  total_value: number;
  weights: Record<string, number>;
  equity_share: number;
  class_shares: Record<string, number>;
  stress_loss: number | null;
  stress_scenario: string;
  largest_holding: string | null;
  largest_weight: number;
  max_r_level: number | null;
};

export type Direction = "lowers_exposure" | "raises_exposure" | "mixed" | "no_change";

export type TradeCheck = {
  verdict: Verdict;
  planned: { ticker: string; side: "buy" | "sell"; amount: number };
  as_of: string;
  reasons: TradeReason[];
  before: PortfolioNumbers | null;
  after: PortfolioNumbers;
  investor_max_r_level: number;
  traded_r_level: number | null;
  risk_review: { approved: boolean; violations: string[] };
  notes: string[];
  label: string;
  // What the trade does to the stock share, the scenario loss and the largest holding. Descriptive only; absent in
  // older saved checks.
  direction?: Direction | null;
  direction_parts?: string[];
};

/** What /api/trade-check and /api/account/trade-check answer. */
export type TradeCheckResponse = {
  check_id: string | null;       // set when the check was saved in the account
  saved?: boolean;
  check: TradeCheck;
  trade_context?: string;        // sealed facts for the advisor chat, sent back unchanged to /api/chat
};

/** The client-facing names of the stress scenarios (egoquant/scenarios.py SCENARIO_LABELS); an unknown id is shown spaced out. */
export const SCENARIO_NAMES: Record<string, string> = {
  equity_down_20: "Stocks fall 20%",
  equity_down_30_bond_down_5: "Severe crash (stocks -30%)",
  rate_up_100bp: "Interest rates rise 1%",
  inflation_shock: "Inflation shock",
  commodity_crypto_selloff: "Gold and crypto sell-off",
};
export const scenarioName = (id: string) => SCENARIO_NAMES[id] ?? id.replace(/_/g, " ");

/** What a verdict is called on screen: where the check stands against the investor's own limits, never advice. The API codes
 *  (advisable, allowed_with_warnings, not_advisable) stay as they are. Red only for a verdict that breaks a limit. */
export const VERDICT_TEXT: Record<Verdict, { title: string; tone: string }> = {
  advisable: { title: "Within your limits", tone: "text-zinc-900" },
  allowed_with_warnings: { title: "Within your limits, with warnings", tone: "text-zinc-900" },
  not_advisable: { title: "Outside your limits", tone: "text-red-700" },
};

// ─── From the advisor chat ───────────────────────────────────────────────────────────────────────────────────
// /chat and /chat/stream answer a trade question from the saved trading history with `trade_checks` (the stream's `done`
// event carries it too). The engine runs the check; the chat only phrases it. Each item is one trade it found in the
// question: either a finished check (status "ok") or the reason it could not be run.

export type ChatTradeStatus = "ok" | "invalid" | "needs_account" | "needs_consent" | "no_history" | "unavailable";

export type ChatTradeCheck = {
  status: ChatTradeStatus;
  reason?: string | null;
  planned?: { ticker: string; side: "buy" | "sell"; amount: number } | null;
  resolved_from_percent?: number | null;   // "sell 20% of my VTI": the share the amount was worked out from
  verdict?: Verdict | null;
  verdict_words?: string | null;           // the card's own wording: "within your limits", "within your limits, with warnings", "outside your limits"
  check?: TradeCheck | null;
};

const CHAT_TRADE_STATUSES = new Set<string>(["ok", "invalid", "needs_account", "needs_consent", "no_history", "unavailable"]);

/** Only well-formed items are shown; a check that says "ok" but has no check inside is shown as not available. */
export function tradeChecksList(value: unknown): ChatTradeCheck[] {
  if (!Array.isArray(value)) return [];
  const out: ChatTradeCheck[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as ChatTradeCheck;
    if (typeof item.status !== "string" || !CHAT_TRADE_STATUSES.has(item.status)) continue;
    const check = item.check && typeof item.check === "object" && typeof item.check.verdict === "string" && item.check.after ? item.check : null;
    out.push(item.status === "ok" && !check ? { ...item, status: "unavailable", check: null } : { ...item, check });
  }
  return out;
}
