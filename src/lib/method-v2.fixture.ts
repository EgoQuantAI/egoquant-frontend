import type { FinalDiagnostics, MethodV2Raw } from "@/lib/egoquant";

// Samples of what the backend sends for portfolio method v2 (docs/PORTFOLIO_V2.md, section 4). The app does not import
// this file; it is what the display was built and checked against (tsc checks the types).
// To see one in the app, add it to a built report (for example in a dev-only fetch stub): FLAT as `report.final_diagnostics`
// (what the engine writes: egoquant/agents/quant/v2/diag.py, flags as 0 or 1, the risk map as a JSON string), or nested as
// `report.method_v2`.

export const FINAL_DIAGNOSTICS_FIXTURE: FinalDiagnostics = {
  v2_style: "max_div",
  v2_level: 0.6,
  v2_effective_n: 7.4,
  v2_largest: 0.24,
  v2_n_holdings: 12,
  v2_n_universe: 292,
  v2_n_representatives: 96,
  v2_group_cap_binding: 1,
  v2_group_caps_dropped: 0,
  v2_resample_n: 8,
  v2_seed: "3fa9c2d71b08e5a4",
  v2_risk_contribution: '{"BIL": 0.06, "BND": 0.12, "EEM": 0.07, "IAU": 0.1, "SCHD": 0.08, "SHY": 0.06, "TIP": 0.09, "VNQ": 0.09, "VTI": 0.19, "VXUS": 0.14}',
  v2_tolerance_points: 2,
  v2_n_contenders: 6,
  v2_worst10_drawdown: 0.23,
  v2_floor_met: 1,
};

// The same facts as one nested object.

export const METHOD_V2_FIXTURE: MethodV2Raw = {
  method: "erc",
  effective_n: 7.4,
  largest: 0.24,
  n_universe: 292,
  n_representatives: 96,
  n_clusters_used: 11,
  group_cap_binding: true,
  diversification_floor_met: true,
  resample_n: 20,
  seed: "3fa9c2d71b08e5a4",
  selection: { rule: "goal_tolerance_drawdown", tolerance_points: 2, n_contenders: 6, worst10_drawdown: 0.23 },
  risk_contribution: { VTI: 0.19, VXUS: 0.14, BND: 0.12, IAU: 0.1, VNQ: 0.09, TIP: 0.09, SCHD: 0.08, EEM: 0.07, SHY: 0.06, BIL: 0.06 },
};
