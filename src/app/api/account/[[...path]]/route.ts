import { forwardToBackend, readLimitedBody } from "@/lib/backend";
import { BUILD_PROXY_TIMEOUT_MS } from "@/lib/build-timing";
import { clearTokens, forbidden, readTokens, refreshSession, sameOrigin } from "@/lib/server-auth";

// The signed-in user's own data: /api/account/<path> -> FastAPI /account/<path>, with the user's access token
// from the HttpOnly cookie as the Authorization header. The browser never sees or sends a token. Only the
// paths below exist; FastAPI verifies the token again and Supabase Row-Level Security does the rest.

export const maxDuration = 120;   // /account/portfolio builds a portfolio, like /api/portfolio; keep it above BUILD_PROXY_TIMEOUT_MS

// Methods per path, and the largest request body (bytes). A Flex report can be 2 MB of text, which JSON
// escaping can double; the other bodies are small.
const ROUTES: Record<string, { methods: string[]; maxBody?: number; timeoutMs?: number }> = {
  "": { methods: ["DELETE"] },                           // delete the account itself
  me: { methods: ["GET"] },
  profile: { methods: ["GET"] },                         // username and picture (the sidebar uses /api/auth/me)
  avatar: { methods: ["PUT"], maxBody: 100_000 },        // a preset or a 160 px photo as a data URL
  consent: { methods: ["POST"], maxBody: 1_000 },
  onboarding: { methods: ["GET", "PUT"], maxBody: 250_000 },   // the onboarding answers (lib/egoquant.ts syncWithAccount)
  "trades/import": { methods: ["POST"], maxBody: 4_200_000 },
  trades: { methods: ["GET"] },
  log: { methods: ["GET"] },
  data: { methods: ["DELETE"] },                         // delete every stored row, keep the account
  portfolio: { methods: ["POST"], maxBody: 50_000, timeoutMs: BUILD_PROXY_TIMEOUT_MS },   // build from the saved history + save the report
  reports: { methods: ["GET"] },
  "reports/:id": { methods: ["GET", "DELETE"] },         // :id is a UUID, checked below
  "reports/:id/briefing": { methods: ["POST"], maxBody: 1_000 },   // the saved report takes the final news briefing
  "reports/:id/contexts": { methods: ["GET"] },          // the Advisor's sealed facts for a saved report
  "trade-check": { methods: ["POST"], maxBody: 50_000, timeoutMs: BUILD_PROXY_TIMEOUT_MS },   // rebuilds the limits, like portfolio
  "trade-checks/:id/decision": { methods: ["POST"], maxBody: 1_000 },          // "I made this trade" / "I did not"
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ path?: string[] }> };

function routeKey(path: string[]): string {
  if (path.length === 2 && path[0] === "reports" && UUID.test(path[1])) return "reports/:id";
  if (path.length === 3 && path[0] === "reports" && UUID.test(path[1]) && (path[2] === "briefing" || path[2] === "contexts")) {
    return `reports/:id/${path[2]}`;
  }
  if (path.length === 3 && path[0] === "trade-checks" && UUID.test(path[1]) && path[2] === "decision") {
    return "trade-checks/:id/decision";
  }
  return path.join("/");
}

async function handle(request: Request, context: Context): Promise<Response> {
  const { path = [] } = await context.params;
  const key = routeKey(path);
  if (!Object.hasOwn(ROUTES, key) || !ROUTES[key].methods.includes(request.method)) {
    return Response.json({ detail: "Not found." }, { status: 404 });
  }
  if (request.method !== "GET" && !sameOrigin(request)) return forbidden();

  let body: string | undefined;
  if (request.method === "POST" || request.method === "PUT") {
    const text = await readLimitedBody(request, ROUTES[key].maxBody ?? 1_000);
    if (text === null) return Response.json({ detail: "Request is too large." }, { status: 413 });
    body = text;
  }

  const { access, refresh } = await readTokens();
  let token = access;
  if (!token && refresh) token = await refreshSession(refresh);
  if (!token) return Response.json({ detail: "Please sign in." }, { status: 401 });

  const backendPath = key === "" ? "/account" : `/account/${path.join("/")}`;
  const call = (bearer: string) => forwardToBackend(backendPath, {
    method: request.method as "GET" | "POST" | "PUT" | "DELETE",
    body, headers: { Authorization: `Bearer ${bearer}` }, timeoutMs: ROUTES[key].timeoutMs ?? 60_000,
  });

  let response = await call(token);
  if (response.status === 401 && refresh) {        // the access token ran out: renew it once and retry
    const renewed = await refreshSession(refresh);
    if (renewed) response = await call(renewed);
  }
  if (response.status === 401) await clearTokens();
  if (key === "" && response.ok) await clearTokens();   // the account is gone: so is the session
  return response;
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
