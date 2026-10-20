import { backendUrl, forwardToBackend, readLimitedBody } from "@/lib/backend";
import { clearTokens, forbidden, readTokens, refreshSession, sameOrigin } from "@/lib/server-auth";

// Server side only. The on-chain sealing routes of one saved report (egoquant/anchoring/routes.py), in the same
// pattern as /api/account/[[...path]]: the user's access token comes from the HttpOnly cookie, the browser never
// sees it, state-changing calls must come from our own site, and the backend checks the token again (RLS).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ReportContext = { params: Promise<{ id: string }> };

export async function forwardReport(
  request: Request, context: ReportContext, action: "confirm" | "seal" | "proof" | "viewed",
  { maxBody = 1_000, timeoutMs = 20_000 }: { maxBody?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ detail: "Report not found." }, { status: 404 });
  if (request.method !== "GET" && !sameOrigin(request)) return forbidden();
  let body: string | undefined;
  if (request.method === "POST") {
    const text = await readLimitedBody(request, maxBody);
    if (text === null) return Response.json({ detail: "Request is too large." }, { status: 413 });
    body = text || "{}";
  }
  const { access, refresh } = await readTokens();
  let token = access;
  if (!token && refresh) token = await refreshSession(refresh);
  if (!token) return Response.json({ detail: "Please sign in." }, { status: 401 });

  const call = (bearer: string) => forwardToBackend(`/account/reports/${id.toLowerCase()}/${action}`, {
    method: request.method as "GET" | "POST", body, headers: { Authorization: `Bearer ${bearer}` }, timeoutMs,
  });
  let response = await call(token);
  if (response.status === 401 && refresh) {           // the access token ran out: renew it once and retry
    const renewed = await refreshSession(refresh);
    if (renewed) response = await call(renewed);
  }
  if (response.status === 401) await clearTokens();
  return response;
}

/** GET the saved report as one HTML page (the backend renders it with the finished news and its Seal section) and
 *  pass it through as a download. `job` (a finished briefing job of this report) is forwarded, checked by the backend. */
export async function downloadReportHtml(request: Request, context: ReportContext): Promise<Response> {
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ detail: "Report not found." }, { status: 404 });
  const job = new URL(request.url).searchParams.get("job");
  const query = job && /^[A-Za-z0-9_-]{1,64}$/.test(job) ? `?job=${encodeURIComponent(job)}` : "";
  const { access, refresh } = await readTokens();
  let token = access;
  if (!token && refresh) token = await refreshSession(refresh);
  if (!token) return Response.json({ detail: "Please sign in." }, { status: 401 });
  const call = (bearer: string) => fetch(`${backendUrl}/account/reports/${id.toLowerCase()}/download${query}`, {
    headers: { Authorization: `Bearer ${bearer}` }, cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  try {
    let response = await call(token);
    if (response.status === 401 && refresh) {
      const renewed = await refreshSession(refresh);
      if (renewed) response = await call(renewed);
    }
    if (response.status === 401) await clearTokens();
    if (!response.ok) {
      return new Response(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
    }
    return new Response(await response.text(), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": response.headers.get("content-disposition") ?? `attachment; filename="egoquant-report-${id.slice(0, 8)}.html"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json({ detail: "Could not reach the server. Check your connection and try again in a moment." }, { status: 502 });
  }
}

/** GET an /account/... path of the signed-in user (e.g. /account/seals), the same token handling as above. */
export async function forwardAccountGet(path: "/account/seals"): Promise<Response> {
  const { access, refresh } = await readTokens();
  let token = access;
  if (!token && refresh) token = await refreshSession(refresh);
  if (!token) return Response.json({ detail: "Please sign in." }, { status: 401 });
  const call = (bearer: string) => forwardToBackend(path, {
    method: "GET", headers: { Authorization: `Bearer ${bearer}` }, timeoutMs: 20_000,
  });
  let response = await call(token);
  if (response.status === 401 && refresh) {
    const renewed = await refreshSession(refresh);
    if (renewed) response = await call(renewed);
  }
  if (response.status === 401) await clearTokens();
  return response;
}
