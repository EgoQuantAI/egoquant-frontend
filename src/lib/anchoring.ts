import { useEffect, useSyncExternalStore } from "react";

// Plan sealing (docs/ON_CHAIN_COORDINATION.md in the backend): a signed-in investor confirms an approved, saved
// report and a fingerprint of the record is published on the Sepolia test chain. This file is only the client side
// of "is it switched on?": GET /api/anchoring/status says `enabled: true` or nothing usable. Anything else (404 while the
// route does not exist, 503, a network error, an odd answer) means OFF, and then no sealing control is shown, no
// seal request is made and nothing here can break a page.

export type AnchoringStatus = {
  chain_id: number;
  network: string;
  explorer: string;
  consent_version: string;
  consent_text: string;     // the one source of the agreement wording (shown verbatim in the confirm dialog)
};

/** The backend's SealOut. `explorer_url` is a link to the public transaction once there is one. */
export type SealOut = {
  status: "pending" | "submitted" | "confirmed" | "failed";
  tx_hash: string | null;
  chain_id: number | null;
  block_number: number | null;
  block_time: string | null;
  explorer_url: string | null;
  error_kind: string | null;
};

/** What GET /account/reports/{id}/seal and POST .../confirm answer (the fields this UI uses). */
export type SealInfo = { commitment: string | null; confirmed_at: string | null; seal: SealOut | null };

const REPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `/api/account/reports/<id>/<action>` for a well-formed report id, else null (an id is never pasted into a path unchecked). */
export function reportPath(reportId: string, action: "seal" | "confirm" | "proof" | "viewed"): string | null {
  return REPORT_ID.test(reportId) ? `/api/account/reports/${reportId}/${action}` : null;
}

function parseStatus(data: unknown): AnchoringStatus | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.enabled !== true) return null;
  if (typeof d.consent_text !== "string" || !d.consent_text.trim()) return null;
  if (typeof d.consent_version !== "string" || !d.consent_version.trim()) return null;
  return {
    chain_id: typeof d.chain_id === "number" ? d.chain_id : 11155111,
    network: typeof d.network === "string" ? d.network : "Sepolia testnet",
    explorer: typeof d.explorer === "string" ? d.explorer : "",
    consent_version: d.consent_version,
    consent_text: d.consent_text,
  };
}

// ─── The status, asked once and shared ──────────────────────────────────────────────────────────────────────────────

const RETRY_MS = 60_000;      // an answer of "off" or a failure is not asked again for a minute
let current: AnchoringStatus | null = null;
let askedAt = 0;
let inflight: Promise<AnchoringStatus | null> | null = null;
const listeners = new Set<() => void>();

function publish(next: AnchoringStatus | null) {
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  listeners.forEach((listener) => listener());
}

/** Ask again now (e.g. after the backend said the agreement text changed). */
export function refreshAnchoringStatus(): Promise<AnchoringStatus | null> {
  askedAt = 0;
  return ensureAnchoringStatus();
}

/** Ask (at most once a minute) whether sealing is switched on. Resolves to null when it is off or unreachable. */
export function ensureAnchoringStatus(): Promise<AnchoringStatus | null> {
  if (inflight) return inflight;
  if (askedAt && Date.now() - askedAt < RETRY_MS) return Promise.resolve(current);
  askedAt = Date.now();
  inflight = (async () => {
    let next: AnchoringStatus | null = null;
    try {
      const response = await fetch("/api/anchoring/status", { cache: "no-store", signal: AbortSignal.timeout(8_000) });
      if (response.ok) next = parseStatus(await response.json());
    } catch {
      // unreachable, not JSON, ...: the feature is simply off
    }
    publish(next);
    inflight = null;
    return next;
  })();
  return inflight;
}

/** The sealing status when it is switched on, otherwise null (also while the first answer is on its way). */
export function useAnchoringStatus(): AnchoringStatus | null {
  const status = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => current,
    () => null,
  );
  useEffect(() => { void ensureAnchoringStatus(); }, []);
  return status;
}

// ─── "A saved report was shown" ─────────────────────────────────────────────────────────────────────────────────────

const VIEWED_KEY = "egoquant.viewedReports";

function wasViewed(id: string): boolean {
  try {
    return (JSON.parse(window.sessionStorage.getItem(VIEWED_KEY) ?? "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}

function rememberViewed(id: string) {
  try {
    const ids = (JSON.parse(window.sessionStorage.getItem(VIEWED_KEY) ?? "[]") as string[]).filter((x) => x !== id);
    window.sessionStorage.setItem(VIEWED_KEY, JSON.stringify([...ids, id].slice(-50)));
  } catch {
    // private window: the backend only logs the first call per report anyway
  }
}

const inFlightViews = new Set<string>();

/**
 * Tell the backend the investor was shown this saved report (it logs `report_viewed` once per report). Only when
 * sealing is on; once per tab session per report; never throws and never shows anything.
 */
export async function markReportViewed(reportId: string): Promise<void> {
  const path = reportPath(reportId, "viewed");
  if (!path || inFlightViews.has(reportId) || wasViewed(reportId)) return;
  inFlightViews.add(reportId);
  try {
    if (!(await ensureAnchoringStatus())) return;
    const response = await fetch(path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) rememberViewed(reportId);
  } catch {
    // best effort
  } finally {
    inFlightViews.delete(reportId);
  }
}
