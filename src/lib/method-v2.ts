import type { MethodV2Raw, Report } from "@/lib/egoquant";

// Portfolio method v2 (docs/PORTFOLIO_V2.md, section 4 of the backend): the chosen portfolio carries flat `v2_*`
// diagnostics (numbers and strings only; the report repeats them as `report.final_diagnostics`). `fromDiagnostics`
// turns them into one nested object (type MethodV2Raw in lib/egoquant.ts), `parseMethodV2` checks that object. A
// backend that sends the nested object itself as `report.method_v2` works too. Everything here is optional and
// defensive: with no keys (method v1, an older saved report, anything odd) nothing is shown. Every number comes
// from the backend; this file only checks it and puts it in words. Fractions are 0 to 1, never percents;
// `tolerance_points` is in points.

export type MethodV2 = {
  method: string | null;
  effectiveN: number | null;
  largest: number | null;
  nUniverse: number | null;
  nRepresentatives: number | null;
  nClustersUsed: number | null;
  nHoldings: number | null;
  groupCapBinding: boolean;
  groupCapsDropped: boolean;
  floorMet: boolean | null;
  resampleN: number | null;
  seed: string | null;
  selection: { rule: string; tolerancePoints: number | null; contenders: number | null; worst10Drawdown: number | null } | null;
  riskShares: { id: string; share: number }[];      // largest first
};

const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const fraction = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1.0001 ? Math.min(v, 1) : null);

/** The checked, typed form of a `method_v2` object, or null when there is nothing usable to show. */
export function parseMethodV2(raw: unknown): MethodV2 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const sel = r.selection && typeof r.selection === "object" ? (r.selection as Record<string, unknown>) : null;
  const shares = r.risk_contribution && typeof r.risk_contribution === "object" && !Array.isArray(r.risk_contribution)
    ? Object.entries(r.risk_contribution as Record<string, unknown>)
        .flatMap(([id, share]) => (fraction(share) !== null ? [{ id, share: fraction(share)! }] : []))
        .sort((a, b) => b.share - a.share || a.id.localeCompare(b.id))
    : [];
  const parsed: MethodV2 = {
    method: typeof r.method === "string" && r.method.trim() ? r.method.trim() : null,
    effectiveN: typeof r.effective_n === "number" && Number.isFinite(r.effective_n) && r.effective_n >= 1 ? r.effective_n : null,
    largest: fraction(r.largest),
    nUniverse: count(r.n_universe),
    nRepresentatives: count(r.n_representatives),
    nClustersUsed: count(r.n_clusters_used),
    nHoldings: count(r.n_holdings) !== null ? Math.round(r.n_holdings as number) : null,
    groupCapBinding: r.group_cap_binding === true,
    groupCapsDropped: r.group_caps_dropped === true,
    floorMet: typeof r.diversification_floor_met === "boolean" ? r.diversification_floor_met : null,
    resampleN: count(r.resample_n),
    seed: typeof r.seed === "string" && /^[0-9a-f]{4,32}$/i.test(r.seed) ? r.seed : null,
    selection: sel && typeof sel.rule === "string"
      ? { rule: sel.rule, tolerancePoints: count(sel.tolerance_points), contenders: count(sel.n_contenders), worst10Drawdown: fraction(sel.worst10_drawdown) }
      : null,
    riskShares: shares,
  };
  // Nothing worth a sentence (an unknown method name alone, no numbers): treat as absent rather than showing an empty box.
  const any = !!methodWords(parsed.method) || parsed.effectiveN !== null || parsed.largest !== null || parsed.riskShares.length > 0;
  return any ? parsed : null;
}

/** A flat yes/no from the backend: 1 or 0 (floats, since diagnostics hold numbers), or a real boolean. Anything else: unknown. */
function flag(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  return v === 1 ? true : v === 0 ? false : undefined;
}

/** `v2_risk_contribution` is a JSON string (ticker -> share, the largest few). A string that is not such an object gives nothing. */
function riskMap(v: unknown): Record<string, number> | undefined {
  if (typeof v !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(v);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, number>) : undefined;
  } catch {
    return undefined;
  }
}

/** The flat `v2_*` diagnostics as the nested object `parseMethodV2` reads, or null when there is no v2 key at all. */
export function fromDiagnostics(d: unknown): MethodV2Raw | null {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const r = d as Record<string, unknown>;
  if (!Object.keys(r).some((k) => k.startsWith("v2_"))) return null;
  const num = (k: string) => (typeof r[k] === "number" ? (r[k] as number) : undefined);
  const hasSelection = num("v2_n_contenders") !== undefined || num("v2_tolerance_points") !== undefined;
  return {
    method: typeof r.v2_style === "string" ? r.v2_style : undefined,
    effective_n: num("v2_effective_n"),
    largest: num("v2_largest"),
    n_holdings: num("v2_n_holdings"),
    n_universe: num("v2_n_universe"),
    n_representatives: num("v2_n_representatives"),
    group_cap_binding: flag(r.v2_group_cap_binding),
    group_caps_dropped: flag(r.v2_group_caps_dropped),
    diversification_floor_met: flag(r.v2_floor_met),
    resample_n: num("v2_resample_n"),
    seed: typeof r.v2_seed === "string" ? r.v2_seed : undefined,
    selection: hasSelection
      ? { rule: "goal_tolerance_drawdown", tolerance_points: num("v2_tolerance_points"), n_contenders: num("v2_n_contenders"), worst10_drawdown: num("v2_worst10_drawdown") }
      : undefined,
    risk_contribution: riskMap(r.v2_risk_contribution),
  };
}

/** What the report says about how its weights were built, or null (method v1, older report, nothing usable). */
export function methodV2Of(report: Pick<Report, "method_v2" | "final_diagnostics">): MethodV2 | null {
  return parseMethodV2(fromDiagnostics(report.final_diagnostics) ?? report.method_v2);
}

// ─── Words ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const METHODS: Record<string, { name: string; what: string }> = {
  erc: {
    name: "Equal risk",
    what: "Each fund is sized so that it adds the same amount of risk to the portfolio, so no single fund drives how it moves.",
  },
  hrp: {
    name: "Grouped risk balance",
    what: "Funds are first grouped by how they move together, then risk is shared out between the groups and inside each group, so calmer groups hold more.",
  },
  maxdiv: {
    name: "Most diversified",
    what: "Weights are chosen to get the most out of funds that do not move together, so the whole is steadier than the sum of its parts.",
  },
  blmv: {
    name: "Return and risk balance",
    what: "Weights balance a modest assumed return against risk. The starting point is a neutral mix for your risk category, not the funds that did best lately.",
  },
  resampled: {
    name: "Averaged return and risk balance",
    what: "The balance of return and risk is worked out many times on slightly different, plausible inputs and averaged, so the result does not bet on one estimate.",
  },
  min_variance: {
    name: "Lowest swings",
    what: "The mix with the smallest ups and downs that still fits all your limits.",
  },
  diversified: {
    name: "Spread out",
    what: "The lowest-swing mix with a push to spread the money over more funds.",
  },
  equal_weight: { name: "Equal weight", what: "Funds of each kind are held in equal amounts." },
  inverse_vol: { name: "Calmer funds hold more", what: "Each fund's weight is larger the calmer the fund is." },
  interest_tilt: { name: "Tilted to your interests", what: "A little extra goes to the areas you said you care about." },
};

// The backend spells two styles with an underscore (docs/PORTFOLIO_V2.md section 4); the older contract text did not.
const ALIASES: Record<string, string> = { max_div: "maxdiv", bl_mv: "blmv" };

export function methodWords(method: string | null): { name: string; what: string } | null {
  if (!method) return null;
  const key = Object.hasOwn(ALIASES, method) ? ALIASES[method] : method;
  return Object.hasOwn(METHODS, key) ? METHODS[key] : null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const percent = (x: number) => `${Math.round(x * 100)}%`;

/** "12 funds, effective N 7.4, largest 24%" (any part the backend did not send is left out). `funds` = holdings count. */
export function summaryLine(m: MethodV2, funds: number | null): string {
  if (m.effectiveN === null && m.largest === null) return "";      // a bare fund count says nothing about the method
  return [
    funds ? plural(funds, "fund", "funds") : null,
    m.effectiveN !== null ? `effective N ${m.effectiveN.toFixed(1)}` : null,
    m.largest !== null ? `largest ${percent(m.largest)}` : null,
  ].filter(Boolean).join(", ");
}

/** The holdings the report lists beyond the funds the backend counts (positions too small to count): "29 more positions ...". */
export function smallPositionsNote(listed: number, funds: number | null): string {
  const extra = funds !== null ? listed - funds : 0;
  return extra > 0 ? `${plural(extra, "more position is", "more positions are")} very small (under half a percent each).` : "";
}

export const EFFECTIVE_N_NOTE =
  "Effective N is how many equal-sized holdings the portfolio behaves like. The higher it is, the less it depends on a few funds.";

/** One sentence for each limit that held the result back (only those that did). `relaxedTold`: the report's own reasons
 *  already say the group limit was relaxed, so that sentence is left out (the Why tab). */
export function capSentences(m: MethodV2, relaxedTold = false): string[] {
  const out: string[] = [];
  if (m.groupCapsDropped) {
    if (relaxedTold) return out.concat(floorSentence(m));
    out.push("The limit on groups of near-identical funds could not be met with the funds open to you at this level, so it was relaxed. The limit on any single fund still applied.");
  } else if (m.groupCapBinding) {
    out.push("A limit on funds that overlap was reached: no group of similar funds may hold more than a fixed share of the portfolio, and this held the result back.");
  }
  return out.concat(floorSentence(m));
}

function floorSentence(m: MethodV2): string[] {
  return m.floorMet === false
    ? ["The minimum spread over several funds could not be fully met with the funds open to you, so the portfolio is as spread out as the limits allow."]
    : [];
}

/** How this portfolio was picked among its rivals (only for a rule this page knows). */
export function selectionSentence(m: MethodV2): string | null {
  const s = m.selection;
  if (!s || s.rule !== "goal_tolerance_drawdown") return null;
  const fall = s.worst10Drawdown !== null
    ? ` In the worst 1 in 10 simulated futures it fell by at least ${percent(s.worst10Drawdown)} from a peak along the way.`
    : "";
  if (s.contenders === null || s.contenders <= 1) {
    return `It had the highest simulated chance of reaching your goal, with no close rival.${fall}`;
  }
  const near = s.tolerancePoints !== null
    ? `within ${s.tolerancePoints % 1 === 0 ? s.tolerancePoints.toFixed(0) : s.tolerancePoints.toFixed(1)} ${s.tolerancePoints === 1 ? "point" : "points"} of the best`
    : "close to the best";
  return `${s.contenders} portfolios had a simulated chance of reaching your goal ${near}. Among them this one was picked for the smaller fall in a bad stretch.${fall}`;
}

/** The tile under "Chosen" in the goal Method tab: how the one portfolio was picked, in a few words. */
export function chosenNote(m: MethodV2 | null): string {
  return m?.selection?.rule === "goal_tolerance_drawdown" ? "Smallest fall among the near-best chances" : "Best chance of reaching your goal";
}

/** How wide the search was: products looked at, groups of similar funds, resampling. Quiet small print. */
export function searchSentence(m: MethodV2): string | null {
  const parts: string[] = [];
  if (m.nUniverse !== null) {
    const open = `${plural(m.nUniverse, "product", "products")} ${m.nUniverse === 1 ? "was" : "were"} open to you`;
    parts.push(
      m.nRepresentatives === null ? open
        : m.nRepresentatives >= m.nUniverse ? `${open} and all were compared`
        : `${open}; ${m.nRepresentatives} were kept after grouping near-identical funds`,
    );
  }
  if (m.nClustersUsed !== null) parts.push(`the portfolio draws on ${plural(m.nClustersUsed, "group", "groups")} of similar funds`);
  if (m.resampleN !== null && m.resampleN > 0) parts.push(`the result averages ${m.resampleN} resampled solutions`);
  if (!parts.length) return null;
  const text = parts.join("; ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}. The same inputs always give the same portfolio${m.seed ? ` (tag ${m.seed.slice(0, 8)})` : ""}.`;
}
