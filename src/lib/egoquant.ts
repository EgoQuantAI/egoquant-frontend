"use client";

import { useSyncExternalStore } from "react";
import { api } from "@/lib/account-api";
import { currentAccount, forgetAccount } from "@/lib/account-state";
import { DRAFT_KEY } from "@/lib/questionnaire-draft";
import { BUILD_BROWSER_TIMEOUT_MS } from "@/lib/build-timing";
import { BUILD_TIMEOUT, busyMessage, genericFailure, isTimeoutMessage, networkMessage, statusMessage } from "@/lib/http-errors";
import { dropIbkrToken, getIbkr, ibkrFields } from "@/lib/ibkr";

// ─── Shapes returned by the backend (egoquant_routes.py) ─────────────────────

export type QuestionOption = { id: string; text: string };

export type Question = {
  id: string;
  section: string;
  type: "single" | "multi" | "number";
  text: string;
  hint?: string;          // our reading aid above the question (GL9/GL10); not part of the validated wording
  options: QuestionOption[];
};

export type Questionnaire = {
  questionnaire_version: string;
  sections: { id: string; title: string }[];
  questions: Question[];
};

export type Answers = {
  questionnaire_version: string;
  choices: Record<string, string>;
  multi_choices: Record<string, string[]>;
  amount_invested: number;
  amount_needed: number;
};

export type Profile = {
  questionnaire_version: string;
  c_level: string;
  explanation: string[];
  tolerance_score: number;
  tolerance_level: number;
  capacity_level: number;
  loss_capacity: number;
  knowledge_score: number;
  binding_dimension: "tolerance" | "capacity" | "gate" | "game";
  no_loss_gate: boolean;
  suitability_max_equity: number;
  product_access: string;
  max_r_level: number;
  blocked_product_types: string[];
  flags: string[];
  // Present only when a Risk Game result was sent (docs/RISK_GAME_BLEND.md): c_level and the limits are the blended ones.
  game_played?: boolean;
  game_score?: number;               // mean of the game's tolerance and loss acceptance, 0 to 100
  game_level?: number;               // 1 to 5
  blended_level?: number;            // two thirds questionnaire tolerance level, one third game level, rounded
  questionnaire_class?: string;      // the category WITHOUT the game
};

export type PortfolioOptions = {
  interest_areas: string[];
  trading_platforms: { id: string; name: string }[];
  interest_products: Record<string, { ticker: string; r_level: number; product_type: string }[]>;
  data: "live" | "synthetic";
};

// Investment preferences (egoquant/preferences): asked right after the C-level. The backend builds the
// form for THIS profile, so an option the profile does not allow arrives with available=false and a reason.
export type PreferenceOption = { id: string; text: string; available: boolean; reason: string | null };

export type PreferenceQuestion = {
  id: string;
  type: "single" | "multi";
  required: boolean;
  text: string;
  requires: Record<string, string> | null;   // e.g. {"P1": "stocks"}: asked only when that was picked
  options: PreferenceOption[];
};

export type PreferenceForm = {
  preferences_version: string;
  c_level: string;
  max_r_level: number;
  questions: PreferenceQuestion[];
};

export type PreferenceAnswers = { preferences_version: string; choices: Record<string, string[]> };

/** What the investor wants Agent C to look at, and where they trade (saved by /interests). */
export type Interests = { preferences: PreferenceAnswers; trading_platforms: string[]; summary: string[] };

/** Whether a follow-up question applies to the current choices (its `requires` options were picked). */
export function applies(question: PreferenceQuestion, choices: Record<string, string[]>): boolean {
  return Object.entries(question.requires ?? {}).every(([qid, option]) => (choices[qid] ?? []).includes(option));
}

export type Intake = {
  preferences?: PreferenceAnswers;   // the app's flow: Agent C fetches data for these interests
  interest_areas?: string[];         // older saved sessions only
  trading_platforms: string[];
  horizon_years: number;
  liquidity_need: number;
  min_cash_buffer: number;
  goal_amount: number;
  monthly_flow: number;          // + contribution, - withdrawal, per month
};

/** What Agent C priced for this investor's interests (PortfolioResult.universe). */
export type Universe = {
  interest_areas: string[];
  instruments: { ticker: string; name: string; asset_class: string; r_level: number }[];
  not_fetched: { ticker: string; reason: string }[];   // the most relevant few, with the reason
  n_not_fetched?: number;                               // all candidates looked at but not priced
  deprioritized: number;
  replaced: Record<string, string>;
  from_cache: number;
  new_requests: number;
  watchlist: string[];
};

export type RiskCheck = { name: string; passed: boolean; detail: string };

export type AllocationRow = {
  asset_id: string; name: string; asset_class: string; weight: number; amount: number;
  expense_ratio: number; risk_share: number;
};
export type LimitCheck = { name: string; value: number; limit: number; direction: string; ok: boolean; source: string };
export type StressRow = { name: string; description: string; portfolio_return: number; amount_change: number };
export type TradeRow = { asset_id: string; name: string; current: number; proposed: number; change: number };
export type Reason = { kind: string; text: string };

/** Portfolio method v2 (backend docs/PORTFOLIO_V2.md, section 4), as sent: every field optional. lib/method-v2.ts checks it. Fractions are 0 to 1. */
export type MethodV2Raw = {
  method?: string;                       // "erc" | "hrp" | "maxdiv" | "blmv" | "resampled" | "min_variance" | ...
  effective_n?: number;                  // 1 / sum(w^2)
  largest?: number;                      // the largest holding, a fraction
  n_universe?: number;                   // products the investor could hold
  n_representatives?: number;            // kept after grouping near-identical funds
  n_clusters_used?: number;              // groups of similar funds the portfolio draws on
  group_cap_binding?: boolean;           // the limit on one group of overlapping funds held the result back
  diversification_floor_met?: boolean;   // false: the minimum effective number could not be reached
  n_holdings?: number;                   // funds held (weight above a rounding error)
  group_caps_dropped?: boolean;          // the group limit made the level infeasible and was relaxed
  resample_n?: number;
  seed?: string;                         // hex, shown only as a reproducibility tag
  selection?: {
    rule?: string;                       // "goal_tolerance_drawdown"
    tolerance_points?: number;
    n_contenders?: number;
    worst10_drawdown?: number | null;    // a fraction
  } | null;
  risk_contribution?: Record<string, number>;   // ticker -> share of the portfolio's variance (sums to 1)
};

/** The chosen portfolio's flat `v2_*` diagnostics (backend docs/PORTFOLIO_V2.md, section 4): numbers and strings only,
 *  yes/no flags as 0 or 1, `v2_risk_contribution` a JSON string (ticker -> share). Absent under method v1. */
export type FinalDiagnostics = Record<string, number | string>;

export type Report = {
  status: string;
  currency: string;
  reference_amount: number;
  headline: string;
  equity_weight: number;
  bond_weight: number;
  cash_weight: number;
  commodity_weight: number;
  crypto_weight: number;
  ex_ante_vol: number;
  worst_loss: number;
  worst_scenario: string;
  limit_scenario: string;
  allocation: AllocationRow[];
  limits: LimitCheck[];
  stress: StressRow[];
  trades: TradeRow[];
  turnover: number | null;
  one_off_trading_cost: number | null;
  ongoing_fee: number;
  reasons: Reason[];
  banners: string[];
  interest_notes: string[];
  disclosures: string[];
  market_briefing?: Briefing | null;   // optional; shown alongside, never changes the numbers
  // Agent D, newer backends: the same news fetch summarised by month, and "What changed" for each period.
  market_briefing_month?: Briefing | null;
  what_changed?: string[];
  what_changed_action?: string | null;
  what_changed_month?: string[];
  what_changed_month_action?: string | null;
  goal?: GoalReport | null;            // goal path: the simulation as the investor reads it (report.py GoalReport)
  category_basis?: { text?: string } | null;   // only when a Risk Game was played: how the category was set, one fixed sentence from the engine
  final_diagnostics?: FinalDiagnostics | null;   // portfolio method v2 only: the v2_* keys (absent under v1, hides the extra parts)
  method_v2?: MethodV2Raw | null;      // the same facts as one nested object, if a backend sends that form instead
};

// The goal simulation in the investor's terms. Every number and sentence is written by the backend
// (report.py build_goal_report); the page only lays it out. HYPOTHETICAL: past data, not a forecast.
export type GoalRow = { label: string; value: string; text: string };
export type GoalReport = {
  label: string;
  goal_amount: number;
  start_amount: number;
  monthly_flow: number;
  horizon_years: number;
  total_contributed: number;
  prob_goal: number;
  in_100: number;            // icons filled in the 100-icon array
  chance: string;            // "73%", "less than 1%", "more than 99%"
  headline: string;          // the chance as a natural frequency
  plan: string;
  precision: string;         // sampling error and how much the market period matters
  outcomes: GoalRow[];       // final amounts, labelled by how often they happen
  severity: GoalRow[];       // how bad a miss can be, in money
  fan: FanPoint[];
  levers_intro: string;
  levers: { kind: string; change: string; chance: string; prob_goal: number }[];
  method: { title: string; text: string }[];
  choice: string[];
  shortlist: { label: string; equity_weight: number; prob_goal: number; p50: number; worst5_shortfall: number; chosen: boolean }[];
  period_checks: { start: string; end: string; prob_goal: number; p50: number }[];
  std_error: number;
  n_paths: number;
  history_start: string;
  history_end: string;
  disclosures: string[];
};

// The market briefing (egoquant/briefing/models.py's Briefing). Fields marked optional come from newer backends;
// the News tab falls back gracefully when they are missing (backend and frontend deploy separately).
export type ToneLabel = "positive" | "neutral" | "negative";
export type FundTone = { ticker: string; label: ToneLabel; value: number; method: string };
export type SourceTier = "tier1" | "tier2" | "unrated" | "tier3";
export type CoverageStatus = {
  // Final states (round 4): "tone" (rated, with a confidence), "quiet" (no news about the fund or what it holds),
  // "unrated" (news found, no rating available). The two older states come only from older backends.
  state: "tone" | "quiet" | "unrated" | "not_enough_coverage" | "not_yet_assessed"; n: number; needed: number; n_waiting: number;
};
export type BriefingItem = {
  item: {
    id: string; title: string; url: string; published_at: string; source_name: string; source_type: string;
    feed?: string; date_status?: "published" | "updated_only" | "unknown";
  };
  matched_tickers: string[];
  matched_areas?: string[];
  exposure?: number | null;
  exposure_text: string;
  tone: { tone: number; model: string } | null;   // FinBERT score; always null on the server (no FinBERT there)
  // Agent D: tone per matched fund (fund-aware LLM, FinBERT fallback). Empty = tone not yet assessed.
  fund_tones?: FundTone[];
  tone_by_fund?: FundTone[];
  tone_method?: "llm_fund_aware" | "finbert" | "mixed" | "unavailable";
  publisher?: string;
  source_tier?: SourceTier;
  tier_reason?: string;
  summary: string;
  summary_kind: "llm" | "template" | "withheld";
  // Held funds this headline concerns through what they hold (ticker -> theme id / readable theme).
  exposure_of?: Record<string, string>;
  exposure_labels?: Record<string, string>;
};
export type AreaInstrument = { ticker: string; name: string; status: "held" | "not_held" | "above_risk_level"; r_level: number | null };
export type BriefingAggregate = {
  subject: string; kind: "instrument" | "area" | "group"; tone: number | null; text: string;
  n_items?: number; tone_previous?: number | null; change?: number | null; exposure?: number | null;
  name?: string; held?: boolean; weight?: number | null; r_level?: number | null; areas?: string[];
  coverage_status?: CoverageStatus | null; instruments?: AreaInstrument[]; parent_area?: string | null;
  headline_ids?: string[]; n_shown_under_holdings?: number; shown_under?: Record<string, number>;
  n_positive?: number; n_neutral?: number; n_negative?: number; n_unrated?: number;
  confidence?: Confidence | null; confidence_previous?: Confidence | null; evidence?: number; evidence_previous?: number;
  compare_note?: string | null; n_exposure?: number; themes?: string[]; theme_labels?: string[];
};
export type Confidence = "high" | "medium" | "low";
export type HoldingGroup = { theme: string; label: string; tickers: string[]; weight: number; aggregate: BriefingAggregate };

/** One Agent D briefing job (/api/briefing/start, /api/briefing/<job>). */
/** The report's news is the briefing job's finished version, or it has no news section at all (same rule as the
 *  backend's news_is_final). Only a report with final news can be sealed. */
export function newsIsFinal(report: Pick<Report, "market_briefing"> | null | undefined): boolean {
  const briefing = report?.market_briefing;
  return !briefing || !!briefing.metadata?.final_job;
}

export type BriefingJobState = {
  job: string;
  state: "running" | "done" | "failed";
  stage: string;
  rated: number;
  total: number;
  left_in_background: number;
  error?: string;
  result?: {
    week: Briefing | null;
    month: Briefing | null;
    what_changed: string[];
    what_changed_month: string[];
    // The re-check offer: set only when a holding's news tone FELL by 0.5 or more (newer backends).
    what_changed_action?: string | null;
    what_changed_month_action?: string | null;
  };
};
export type BriefingAlert = {
  subject: string; kind?: string; message: string; action: string; summary?: string;
  change?: number; tone?: number | null; tone_previous?: number | null; n_items?: number; exposure?: number;
};

export type Briefing = {
  as_of: string;
  data_source: "live" | "fixture" | "mixed";
  period_start: string;
  period_end: string;
  briefing_period?: "week" | "month";
  items: BriefingItem[];
  instrument_aggregates: BriefingAggregate[];
  area_aggregates: BriefingAggregate[];
  alerts: BriefingAlert[];
  suitability_notes: { area: string; text: string }[];
  diversity_suggestions?: { area: string; reason: string; name: string; url: string; source_type: string }[];
  metadata: {
    sources_skipped: string[]; n_fund_tones_llm?: number; n_fund_tones_finbert?: number;
    n_fund_tones_unavailable?: number;
    final_job?: string | null;   // set by the briefing job: the FINISHED version (the quick in-request one has none)
  };
  labels: string[];
  banners: string[];
  tone_note?: string;
  period_words?: { this: string; last: string };
  alert_threshold?: number | null;
  holdings_order?: string[];
  chosen_areas?: string[];
  tier_counts?: Partial<Record<SourceTier, number>>;
  method_counts?: { llm_fund_aware?: number; finbert?: number; not_yet_assessed?: number };
  low_reliability_items?: string[];
  single_tier_notes?: string[];
  largest_move?: { subject: string; kind: string; change: number } | null;
  tier_legend?: { tier: SourceTier; label: string; explanation: string; weight: number | null }[];
  n_date_unknown?: number;
  compare_notes?: string[];
  holding_groups?: HoldingGroup[];
  small_positions?: string[];
};

export type GoalOutcome = {
  menu_index: number;
  style: string;
  label: string;
  equity_weight: number;
  prob_goal: number;
  p10: number;
  p50: number;
  p90: number;
  worst5_shortfall: number;
  prob_depleted: number;
  drawdown_p50?: number;      // largest fall from a previous high along the way: median path
  drawdown_p90?: number;      // ... worst 10% of paths
  prob_drawdown_20?: number;  // share of paths that fall 20% or more at some point
  vol: number | null;
  stress_loss: number;
  chosen: boolean;
};

export type FanPoint = { year: number; p10: number; p25: number; p50: number; p75: number; p90: number };

export type GoalResult = {
  spec: { start_amount: number; monthly_flow: number; goal_amount: number; horizon_years: number };
  history_start: string;
  history_end: string;
  history_days: number;
  n_paths: number;
  block_days: number;
  chosen_reason: string;
  fan: FanPoint[];
  total_contributed: number;
  label: string;
  history_note?: string;                 // how the history window was chosen
  backfilled?: {                         // younger funds whose early history was rebuilt (Stambaugh/Page)
    ticker: string; own_start: string; filled_days: number; factors: string[]; r_squared: number; method: string;
  }[];
  n_candidates?: number;
  chosen: Omit<GoalOutcome, "label" | "vol" | "stress_loss" | "chosen">;
  shortlist: GoalOutcome[];
  screening: {
    counts: Record<string, number>;
    band_lower: number;
    band_upper: number;
    facts: string[];
    relaxed: string[];
    ignored: string[];
  };
};

/** What Agent B read from the investor's IBKR history (never the trades themselves). */
export type TradingHistorySummary = {
  source: "ibkr_report" | "ibkr_flex";
  n_trades: number;
  start: string;
  end: string;
  currency: string;
  notes: string[];
  valued_at_trade_price: string[];   // tickers valued at their last trade price (no market price was available)
  holdings_left_out: string[];       // tickers not in our product list
};

export type PortfolioResult = {
  approved: boolean;
  status: string;
  c_level: string;
  as_of: string;
  data_source: string;
  fallback_reason?: string | null;   // why the live feed was replaced (by saved real prices or by synthetic ones): safe label
  prices_as_of?: string | null;      // set when the saved snapshot was used: the day its prices run to (as_of is the request's day)
  price_note?: string | null;        // e.g. "real prices as of 2026-10-16, cached (Yahoo Finance; crypto from Binance)"
  snapshot_first?: boolean;          // the saved snapshot was CHOSEN (snapshot price mode), not a fallback after a failed live feed
  violations: string[];
  checks: RiskCheck[];
  game_note: string | null;
  universe?: Universe | null;
  goal: GoalResult | null;
  goal_unavailable?: string | null;  // a goal was given but not simulated (too little price history): why
  report: Report;
  html: string;
  trading_history?: TradingHistorySummary | null;   // set when an IBKR report or token was used
  chat_context?: string;   // sealed facts for the advisor chat; sent back unchanged to /api/chat
  briefing_context?: string | null;   // sealed inputs for Agent D's full news briefing (/api/briefing/start)
  what_if_context?: string | null;    // sealed inputs for the What-If Agent; sent back unchanged to /api/chat
  report_id?: string | null;   // set when the build was saved in the signed-in user's account
  agent_d_final?: string;      // the briefing job whose FINAL news briefing this report now carries
};

// The app's Risk Game result, written by src/app/game when a game ends.
export type RiskGame = { tolerance: number; lossAcceptance: number; completedAt: string; crashTest?: CrashTest };

/** The Crash Test's result, as the backend takes it (risk_game.crash_test). All fractions 0-1, never percents. */
export type CrashTest = {
  sold_at_drawdown: number | null;   // loss from the running peak at the first sale; null = held on
  sold_fraction: number;             // share of the fund sold in total
  max_drawdown_seen: number;         // deepest loss from the running peak that was shown
};

/** The Risk Game as the backend takes it, inside `answers.risk_game` (docs/RISK_GAME_BLEND.md section 3). */
export type RiskGameBody = { tolerance: number; loss_acceptance: number; crash_test?: CrashTest; completed_at: string };

/** The game result to send, whatever its age (the backend only refuses a time more than 10 minutes in the future), or null when
 *  there is none. */
export function gameBody(game: RiskGame | null | undefined, now = Date.now()): RiskGameBody | null {
  if (!game) return null;
  const playedAt = Date.parse(game.completedAt);
  // A fast device clock must not block every call: a future (or unreadable) time is sent as now.
  const at = Number.isFinite(playedAt) ? Math.min(playedAt, now) : now;
  const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
  return {
    tolerance: clamp(game.tolerance), loss_acceptance: clamp(game.lossAcceptance),
    ...(game.crashTest ? { crash_test: game.crashTest } : {}),
    completed_at: new Date(at).toISOString(),
  };
}

/** `answers` with the game inside, sent ONCE (a second, top-level copy would have to be identical), for every call that takes
 *  answers (/profile, /preferences/form, /preferences/areas, /portfolio, /account/portfolio, /trade-check). Without a game the
 *  answers go as they are. */
export function answersWithGame(answers: Answers, game: RiskGame | null | undefined, now = Date.now()): Answers & { risk_game?: RiskGameBody } {
  const body = gameBody(game, now);
  return body ? { ...answers, risk_game: body } : answers;
}

/** Where the person stands with the Risk Game: played (counts), skipped on purpose, or not yet. */
export type GameState = "played" | "skipped" | "none";
export function gameState(session: Pick<Session, "riskGame" | "gameSkipped"> | null | undefined): GameState {
  if (session?.riskGame) return "played";
  return session?.gameSkipped ? "skipped" : "none";
}

// ─── Saved state (localStorage is the working copy; a signed-in person's is also kept in their account) ─────

export type Session = {
  answers?: Answers;
  profile?: Profile;
  interests?: Interests;
  intake?: Intake;
  result?: PortfolioResult;
  builtAt?: string;
  savedAt?: string;      // the last change, to pick the newer of this browser's copy and the account's
  riskGame?: RiskGame;   // read from the game's own key, never written here
  gameSkipped?: boolean; // the person chose to skip the Risk Game (a marker in the game's own key); a played game replaces it
};

const KEY = "egoquant.session.v1";
const GAME_KEY = "eq_game_result";
// eq_profile_* were written by older builds for the game page; still removed on reset.
const LEGACY_KEYS = ["eq_profile_complete", "eq_profile_result", GAME_KEY];
const EVENT = "egoquant-session";
let cachedRaw: string | null = null;
let cachedValue: Session = {};

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** A stored crash test, or undefined when it is missing or damaged (the backend would reject odd numbers). */
function parseCrashTest(value: unknown): CrashTest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const c = value as Partial<CrashTest>;
  const fraction = (x: unknown): x is number => typeof x === "number" && x >= 0 && x <= 1;
  const sold = c.sold_at_drawdown === null || fraction(c.sold_at_drawdown);
  if (!sold || !fraction(c.sold_fraction) || !fraction(c.max_drawdown_seen)) return undefined;
  return { sold_at_drawdown: c.sold_at_drawdown ?? null, sold_fraction: c.sold_fraction, max_drawdown_seen: c.max_drawdown_seen };
}

function parseGame(raw: string | null): RiskGame | undefined {
  if (!raw) return undefined;
  try {
    const g = JSON.parse(raw) as Partial<RiskGame>;
    if (typeof g.tolerance === "number" && typeof g.completedAt === "string") {
      return { tolerance: g.tolerance, lossAcceptance: g.lossAcceptance ?? 50, completedAt: g.completedAt,
               crashTest: parseCrashTest(g.crashTest) };
    }
  } catch {
    // ignore a damaged entry
  }
  return undefined;
}

/** The game's own key holds either a played result or, after "Skip", a marker { skipped: true }. */
function isSkipMarker(raw: string | null): boolean {
  if (!raw) return false;
  try {
    return (JSON.parse(raw) as { skipped?: unknown }).skipped === true;
  } catch {
    return false;
  }
}

/** Record that the person chose to skip the Risk Game (confirmed by the caller). A later game replaces the marker. */
export function skipRiskGame(): boolean {
  try {
    window.localStorage.setItem(GAME_KEY, JSON.stringify({ skipped: true, skippedAt: new Date().toISOString() }));
  } catch {
    return false;
  }
  return saveSession({});
}

function snapshot(): Session {
  const raw = `${read(KEY) ?? ""}\u0000${read(GAME_KEY) ?? ""}`;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    let saved: Session = {};
    try {
      saved = JSON.parse(read(KEY) || "{}") as Session;
    } catch {
      saved = {};
    }
    const game = parseGame(read(GAME_KEY));
    cachedValue = { ...saved, riskGame: game, gameSkipped: !game && isSkipMarker(read(GAME_KEY)) ? true : undefined };
  }
  return cachedValue; // same object while the stored text is unchanged
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The saved state, or null while rendering on the server (no localStorage there). */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** The saved state outside React (null while rendering on the server). */
export function currentSession(): Session | null {
  return typeof window === "undefined" ? null : snapshot();
}

/** Merge `update` into the saved state (and the account's copy). Returns false when the browser refuses to store it.
 *  `saveSession({})` after the game writes its own key pushes the new game result too. */
export function saveSession(update: Omit<Session, "riskGame" | "gameSkipped" | "savedAt">): boolean {
  const { riskGame: _game, gameSkipped: _skipped, ...current } = snapshot();
  void _game;
  void _skipped;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...current, ...update, savedAt: new Date().toISOString() }));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(EVENT));
  pushSession();
  return true;
}

/** Drop this browser's copy but keep syncing (after "Delete my data": the account's copy is already gone). */
export function clearLocal() {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(DRAFT_KEY);              // a half-answered questionnaire is part of the local copy too
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
  } catch {
    // nothing stored
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Forget the profile, portfolio and game result (used before retaking the questionnaire). */
export function resetSession() {
  clearLocal();
  pushSession();
}

// ─── The account's copy ──────────────────────────────────────────────────────
// Onboarding needs an account. Every change is pushed to /api/account/onboarding (one row per user), so the profile
// follows the person to another browser, and the next person on this browser never sees it: at sign-in the newer
// of the two copies wins, and a copy that belongs to someone else is dropped. The built report itself is already
// saved in the account (/account/portfolio); the copy keeps its id and the sealed advisor contexts only.

const OWNER_KEY = "egoquant.session.owner";   // whose session this browser holds (username)
let owner: string | null = null;              // set once this page load has synced with the account
let pushTimer: ReturnType<typeof setTimeout> | null = null;

type AccountCopy = {
  answers?: Answers;
  profile?: Profile;
  interests?: Interests;
  intake?: Intake;
  riskGame?: RiskGame | { skipped: true; skippedAt?: string };   // a played result, or the marker of a confirmed skip
  builtAt?: string;
  result?: { report_id: string; chat_context?: string; what_if_context?: string; briefing_context?: string };
  savedAt: string;
};

function accountCopy(): AccountCopy {
  const s = snapshot();
  const r = s.result;
  return {
    answers: s.answers, profile: s.profile, interests: s.interests, intake: s.intake,
    riskGame: s.riskGame ?? (s.gameSkipped ? { skipped: true } : undefined),
    builtAt: r?.report_id ? s.builtAt : undefined,
    result: r?.report_id
      ? { report_id: r.report_id, chat_context: r.chat_context, what_if_context: r.what_if_context ?? undefined,
          briefing_context: r.briefing_context ?? undefined }
      : undefined,
    savedAt: s.savedAt ?? new Date().toISOString(),
  };
}

function pushSession() {
  if (!owner) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    // Best effort: this browser keeps the working copy, and the next change or sign-in pushes again.
    void api("/api/account/onboarding", { method: "PUT", body: JSON.stringify({ state: accountCopy() }) });
  }, 600);
}

/** Write the account's copy into this browser. The report comes from the account's saved reports. */
async function applyAccountCopy(copy: AccountCopy) {
  const local = snapshot().result;
  let result: PortfolioResult | undefined;
  if (copy.result) {
    if (local?.report_id === copy.result.report_id) {
      result = local;                                  // the same build: keep it (it also has the download)
    } else {
      const { status, data } = await api(`/api/account/reports/${encodeURIComponent(copy.result.report_id)}`);
      if (status === 200 && data.report && typeof data.report === "object") {
        result = { ...(data.report as PortfolioResult), ...copy.result };
      }
    }
  }
  const session: Omit<Session, "riskGame"> = {
    answers: copy.answers, profile: copy.profile, interests: copy.interests, intake: copy.intake,
    result, builtAt: result ? copy.builtAt : undefined, savedAt: copy.savedAt,
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
    if (copy.riskGame) window.localStorage.setItem(GAME_KEY, JSON.stringify(copy.riskGame));
    else window.localStorage.removeItem(GAME_KEY);
  } catch {
    // storage blocked: the pages ask again
  }
  window.dispatchEvent(new Event(EVENT));
}

/** At sign-in (each page load): make this browser's session and the account's copy agree. `prefetched`: the account's copy
 *  as /api/auth/me already read it (same status and body as GET /api/account/onboarding), so no second request is made. */
export async function syncWithAccount(username: string, prefetched?: { status: number; data: Record<string, unknown> }) {
  const previous = read(OWNER_KEY);
  if (previous && previous !== username) clearLocal();   // someone else's session: never shown, never pushed
  const local = snapshot();
  const hasLocal = !!(local.answers || local.profile || local.riskGame || local.gameSkipped);
  const { status, data } = prefetched ?? await api("/api/account/onboarding", { timeoutMs: 15_000 });
  const copy = status === 200 && data.state && typeof data.state === "object" ? (data.state as AccountCopy) : null;
  try {
    window.localStorage.setItem(OWNER_KEY, username);
  } catch {
    // storage blocked: nothing is kept in this browser anyway
  }
  owner = username;
  if (status !== 200) return;                            // account copy unavailable: keep working in this browser
  if (copy && (!hasLocal || (copy.savedAt ?? "") > (local.savedAt ?? ""))) await applyAccountCopy(copy);
  else if (hasLocal) pushSession();
}

/** Signed out (logout, account deleted, session ended): drop this browser's copy; the account keeps its own. */
export function forgetSession() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  owner = null;
  try {
    window.localStorage.removeItem(OWNER_KEY);
  } catch {
    // nothing stored
  }
  clearLocal();
}

/** Whether this browser holds a signed-in person's session (so a signed-out page must drop it). */
export function sessionHasOwner(): boolean {
  return !!read(OWNER_KEY);
}

// ─── Requests ────────────────────────────────────────────────────────────────

/** Turn a FastAPI error body into one readable sentence. */
export function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { loc?: unknown[]; msg?: unknown };
      const where = Array.isArray(first.loc) ? first.loc.filter((p) => p !== "body").join(".") : "";
      const msg = typeof first.msg === "string" ? first.msg.replace(/^Value error, /, "") : "invalid value";
      return where ? `${where}: ${msg}` : msg;
    }
  }
  return fallback;
}

/** An /api answer that was not OK: a readable message, and the HTTP status for callers that branch on it. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Call one of our /api routes and return its JSON, or throw an Error with a readable message. */
export async function callApi<T>(path: string, init: RequestInit & { timeoutMs: number }): Promise<T> {
  const { timeoutMs, signal, ...rest } = init;
  let response: Response;
  try {
    // The caller's own signal (a Retry) and the time limit both end the wait.
    const limit = AbortSignal.timeout(timeoutMs);
    response = await fetch(path, { ...rest, signal: signal ? AbortSignal.any([signal, limit]) : limit });
  } catch (cause) {
    throw new Error(networkMessage(cause));
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // non-JSON body: handled below
  }
  if (!response.ok) {
    const retryAfter = response.headers.get("Retry-After");
    const message = statusMessage(response.status, path.startsWith("/api/account/"), retryAfter);
    throw new ApiError(message ?? busyMessage(response.status, errorMessage(data, genericFailure(response.status)), retryAfter),
                       response.status);
  }
  if (data === null) throw new Error("The server returned an empty answer.");
  return data as T;
}

/** The facts /portfolio, /account/portfolio and the trade checks all start from (the IBKR history is added by the caller).
 *  The Risk Game rides inside `answers` (docs/RISK_GAME_BLEND.md), like in every other call that takes answers. */
export function portfolioFacts(answers: Answers, intake: Intake, riskGame?: RiskGame) {
  // Exactly one of preferences / interest_areas goes to the backend (preferences win).
  const { preferences, interest_areas, ...rest } = intake;
  const wanted = preferences ? { preferences } : { interest_areas };
  return { answers: answersWithGame(answers, riskGame), ...wanted, ...rest };
}

/**
 * Build (or rebuild) the portfolio from saved answers and preferences, then save the result in this browser.
 * Visitors use /api/portfolio. A signed-in person uses /api/account/portfolio instead: it builds from the IBKR
 * history saved in the account and keeps the report there. IBKR data held in this tab (not saved in the account)
 * is only understood by /api/portfolio, so then the build is a visitor build. `mode` forces one or the other.
 */
export async function buildPortfolio(
  answers: Answers, intake: Intake, riskGame?: RiskGame, mode: "auto" | "account" | "visitor" = "auto",
  signal?: AbortSignal,
) {
  const facts = portfolioFacts(answers, intake, riskGame);
  const call = (path: string, extra: object) =>
    callApi<PortfolioResult>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...facts, ...extra }),
      timeoutMs: BUILD_BROWSER_TIMEOUT_MS,
      signal,
    });
  const account = mode === "visitor" ? null : mode === "account" || !getIbkr() ? await currentAccount() : null;

  let result: PortfolioResult;
  try {
    try {
      // The IBKR history is in memory only (lib/ibkr.ts), so it is never part of `intake` or the saved session.
      result = account || mode === "account" ? await call("/api/account/portfolio", {}) : await call("/api/portfolio", ibkrFields());
    } catch (cause) {
      if (!(cause instanceof ApiError) || cause.status !== 401 || mode === "account") throw cause;
      forgetAccount();                                   // the session ran out: build as a visitor instead
      result = await call("/api/portfolio", ibkrFields());
    }
  } catch (cause) {
    // A slow build is the one failure with its own advice (fewer interest areas); every other error keeps its sentence.
    if ((cause instanceof ApiError && cause.status === 504) || isTimeoutMessage(cause)) {
      throw new ApiError(BUILD_TIMEOUT, cause instanceof ApiError ? cause.status : 504);
    }
    throw cause;
  } finally {
    // A Flex token is never kept past the request that used it. A request the caller cancelled in order to retry has not
    // finished its job: the retry still needs the token, and drops it itself.
    if (!signal?.aborted) dropIbkrToken();
  }
  if (!saveSession({ intake, result, builtAt: new Date().toISOString() })) {
    throw new Error("Your browser blocked saving the result. Allow site storage and retry.");
  }
  return result;
}

/** "real_estate" -> "Real estate" */
export function label(id: string): string {
  const text = id.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const pct = (x: number | null | undefined, digits = 0) =>
  typeof x === "number" && Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : "–";

/** Where the prices come from, in one line: the saved snapshot's provider and day. "Live prices were unavailable" is said
 *  only when the snapshot replaced a failed live feed; in snapshot price mode the snapshot is the plan, not a failure. */
export const priceLine = (r: Pick<PortfolioResult, "as_of" | "data_source" | "price_note" | "snapshot_first">): string =>
  r.data_source === "synthetic" ? `Prices as of ${r.as_of} · synthetic demo data`
  : r.price_note ? `${r.price_note.charAt(0).toUpperCase()}${r.price_note.slice(1)}${r.snapshot_first ? "" : " · live prices were unavailable"}`
  : `Prices as of ${r.as_of} · real market data`;
