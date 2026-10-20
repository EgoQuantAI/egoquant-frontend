import { networkMessage, statusMessage } from "@/lib/http-errors";

export const SIGNED_OUT_EVENT = "egoquant-signed-out";

// One request to our own /api routes (the signed-in user's cookies ride along); the status is part of the result.
// A too-large (411/413), rate-limited (429) or timed-out (504) answer carries a readable sentence in `detail`.

export type ApiResult = { status: number; data: Record<string, unknown> };

export async function api(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<ApiResult> {
  const { timeoutMs = 30_000, ...rest } = init;
  try {
    const response = await fetch(path, {
      ...rest,
      headers: rest.body ? { "Content-Type": "application/json" } : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      // no body
    }
    // A 401 on the account routes means the session ended: tell the sidebar (lib/profile) so it stops showing the name.
    if (response.status === 401 && path.startsWith("/api/account")) window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    const message = statusMessage(response.status, false, response.headers.get("Retry-After"));
    return { status: response.status, data: message ? { ...data, detail: message } : data };
  } catch (cause) {
    return { status: 0, data: { detail: networkMessage(cause) } };
  }
}

export const detail = (data: Record<string, unknown>, fallback: string) =>
  typeof data.detail === "string" ? data.detail : fallback;

export function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
