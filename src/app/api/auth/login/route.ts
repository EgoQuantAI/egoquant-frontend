import { readLimitedBody } from "@/lib/backend";
import {
  EMAIL, authConfigured, forbidden, notConfigured, notConfirmed, sameOrigin, storeSession, supabaseAuth, tooManyAttempts,
} from "@/lib/server-auth";
import { afterSignIn } from "../after-sign-in";

// Log in with email + password. The tokens go straight into HttpOnly cookies; the answer carries none.
// The sign-up's "check your inbox" screen also calls this every few seconds with the password it holds in memory:
// "email_not_confirmed" tells it to keep waiting. Supabase only says that when the password is right, so the code
// reveals nothing to someone who does not know the password.

const bad = (detail: string, status = 400, code?: string) => Response.json({ detail, ...(code ? { code } : {}) }, { status });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  if (!authConfigured()) return notConfigured();
  if (tooManyAttempts(request, "login", 12)) return bad("Too many attempts. Please wait a minute.", 429);

  const raw = await readLimitedBody(request, 2_000);
  let input: { email?: unknown; password?: unknown } = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    return bad("Invalid request.");
  }
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!EMAIL.test(email) || password === "" || password.length > 200) return bad("Enter your email and password.");

  const { status, data } = await supabaseAuth("/token?grant_type=password", { email, password });
  if (status === 429) return bad("Too many attempts. Please wait a minute.", 429);
  if (status !== 200 && notConfirmed(data)) {
    return bad("Your email is not confirmed yet. Open the link we sent you.", 403, "email_not_confirmed");
  }
  const access = status === 200 ? await storeSession(data) : null;
  // One message for a wrong password and an unknown email.
  if (!access) return bad("Email or password is incorrect.", 401, "invalid_credentials");
  await afterSignIn(access);
  return Response.json({ ok: true });
}
