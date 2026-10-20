import { forwardToBackend } from "@/lib/backend";
import { authConfigured, clearTokens, nameInToken, readTokens, refreshSession } from "@/lib/server-auth";

// Who is signed in (name, username and picture), for the sidebar. Always 200: { signedIn: false } for visitors, so a
// signed-out page logs no error. The token stays in the HttpOnly cookie; the backend verifies it again.
// Signed in, it also carries the account's onboarding copy (`onboarding`: status and body of GET /account/onboarding), read
// at the same time as the profile, so the first page load waits for one round trip instead of two (lib/egoquant.ts syncWithAccount).

const out = () => Response.json({ signedIn: false }, { headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const { access, refresh } = await readTokens();   // reading the cookies first also keeps this route dynamic
  // Accounts not set up on this deployment: say so, so no page offers a sign-up that cannot work.
  if (!authConfigured()) return Response.json({ signedIn: false, configured: false }, { headers: { "Cache-Control": "no-store" } });
  let token = access;
  if (!token && refresh) token = await refreshSession(refresh);
  if (!token) return out();

  const get = (path: string, bearer: string, timeoutMs: number) =>
    forwardToBackend(path, { method: "GET", headers: { Authorization: `Bearer ${bearer}` }, timeoutMs });
  const call = (bearer: string) => Promise.all([get("/account/profile", bearer, 10_000), get("/account/onboarding", bearer, 15_000)]);
  let [response, onboarding] = await call(token);
  if (response.status === 401 && refresh) {        // the access token ran out: renew it once and retry
    const renewed = await refreshSession(refresh);
    if (renewed) {
      token = renewed;
      [response, onboarding] = await call(renewed);
    }
  }
  if (response.status === 401) {
    await clearTokens();
    return out();
  }
  // Signed in, but the profile could not be read (backend busy or older): show the account without a picture.
  const data = response.ok ? ((await response.json().catch(() => ({}))) as Record<string, unknown>) : {};
  return Response.json(
    {
      signedIn: true,
      username: typeof data.username === "string" ? data.username : null,
      // The backend reads it from the verified user; an older backend does not, so fall back to the token's claim.
      name: typeof data.name === "string" ? data.name : nameInToken(token),
      avatar: typeof data.avatar === "string" ? data.avatar : null,
      onboarding: { status: onboarding.status, data: await onboarding.json().catch(() => ({})) },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
