import { readLimitedBody } from "@/lib/backend";
import {
  authConfigured, forbidden, notConfigured, sameOrigin, storeSession, supabaseAuth, supabaseUser, tooManyAttempts,
} from "@/lib/server-auth";
import { afterSignIn } from "../after-sign-in";

// Supabase's default confirmation link comes back to the site's root with a fresh session in the URL fragment
// (#access_token=...&refresh_token=...&type=signup). The page (components/email-confirmed.tsx) posts the two tokens
// here once and wipes them from the address bar. They are checked with Supabase, then the refresh token is traded
// for a NEW session at once, which retires the one that sat in the URL and the history. Only the new tokens are
// stored, in the HttpOnly cookies, so from here on the page holds no token.

const bad = (detail: string, status = 400) => Response.json({ detail }, { status });
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  if (!authConfigured()) return notConfigured();
  if (tooManyAttempts(request, "session", 10)) return bad("Too many attempts. Please wait a minute.", 429);

  const raw = await readLimitedBody(request, 8_000);
  let input: { access_token?: unknown; refresh_token?: unknown } = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    return bad("Invalid request.");
  }
  const access = typeof input.access_token === "string" ? input.access_token : "";
  const refresh = typeof input.refresh_token === "string" ? input.refresh_token : "";
  if (!JWT.test(access) || access.length > 6_000 || !/^[A-Za-z0-9_-]{6,200}$/.test(refresh)) return bad("Invalid link.");

  const linked = await supabaseUser(access);
  if (linked.status !== 200 || typeof linked.data.id !== "string") return bad("This link has expired.", 401);
  const renewed = await supabaseAuth("/token?grant_type=refresh_token", { refresh_token: refresh });
  if (renewed.status !== 200) return bad("This link has expired.", 401);
  const user = renewed.data.user as { id?: unknown } | undefined;
  if (user?.id !== linked.data.id) return bad("Invalid link.");        // both tokens must be the same person's
  const fresh = await storeSession(renewed.data);
  if (!fresh) return bad("This link has expired.", 401);
  await afterSignIn(fresh);
  return Response.json({ ok: true });
}
