import { forwardToBackend, readLimitedBody } from "@/lib/backend";
import {
  EMAIL, NAME, PASSWORD_MAX, PASSWORD_MIN, authConfigured, forbidden, notConfigured, publicOrigin, sameOrigin,
  rateLimitDetail, storeSession, supabaseAuth, tidyName, tooManyAttempts,
} from "@/lib/server-auth";
import { afterSignIn } from "../after-sign-in";

// Create an account from the onboarding screens: a name, email, password, the consents ticked on the last screen and
// the "not investment advice" acknowledgement. Supabase Auth keeps the password (we never store or log it).
// Everything else rides in the person's own user_metadata (no new table): `name`, `username` (made from the name;
// the database trigger needs a unique one), `eq_consents` ({scope: version}, recorded by the backend at the first
// sign-in, see ../after-sign-in.ts) and `eq_ack`.
// With "Confirm email" on, Supabase emails a link that comes back to this site's root ("redirect_to", which must be
// in the project's Redirect URLs) and nobody is signed in yet; with it off, the answer carries a session.

const bad = (detail: string, status = 400) => Response.json({ detail }, { status });
const SCOPES = new Set(["ibkr_data", "trade_check"]);
const ACK_VERSION = "2026-10-20";   // the wording of the acknowledgement on the last onboarding screen

/** "Ümit Çelik" -> "umit_celik": what the trigger accepts (3-20 of a-z, 0-9, _), with room for a suffix. */
function usernameBase(name: string): string {
  const ascii = name.toLowerCase().replace(/ı/g, "i").replace(/ß/g, "ss").normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const slug = ascii.replace(/[^a-z0-9]+/g, "_").replace(/^_+/, "").slice(0, 14).replace(/_+$/, "");
  return slug.length >= 3 ? slug : "investor";
}

const withSuffix = (base: string) => `${base}_${Math.floor(1000 + Math.random() * 9000)}`;

/** The base itself when free, else the base with a random 4-digit suffix that the backend says is free. */
async function freeUsername(base: string): Promise<string> {
  for (const candidate of [base, withSuffix(base), withSuffix(base), withSuffix(base)]) {
    const answer = await forwardToBackend(`/account/username-available?name=${encodeURIComponent(candidate)}`,
      { method: "GET", timeoutMs: 8_000 });
    if (!answer.ok) break;                                     // cannot ask: a suffixed one is very likely free
    if ((await answer.json().catch(() => null))?.available === true) return candidate;
  }
  return withSuffix(base);
}

/** The consent texts' version, from the backend that will record them (null when it cannot be asked). */
async function consentVersion(): Promise<string | null> {
  const answer = await forwardToBackend("/account/consent-version", { method: "GET", timeoutMs: 8_000 });
  const data = answer.ok ? await answer.json().catch(() => null) : null;
  return typeof data?.version === "string" ? data.version : null;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  if (!authConfigured()) return notConfigured();
  if (tooManyAttempts(request, "signup", 5)) return bad("Too many attempts. Please wait a minute.", 429);

  const raw = await readLimitedBody(request, 5_000);
  let input: { name?: unknown; email?: unknown; password?: unknown; consents?: unknown; acknowledged?: unknown } = {};
  try {
    input = raw ? JSON.parse(raw) : {};
  } catch {
    return bad("Invalid request.");
  }
  const name = typeof input.name === "string" ? tidyName(input.name) : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const consents = Array.isArray(input.consents) ? [...new Set(input.consents.filter((s) => SCOPES.has(s)))] : [];
  if (!NAME.test(name)) return bad("Tell us what to call you, in letters.");
  if (!EMAIL.test(email)) return bad("Enter a valid email address.");
  if (password.length < PASSWORD_MIN) return bad(`Use a password of at least ${PASSWORD_MIN} characters.`);
  if (password.length > PASSWORD_MAX) return bad(`Use a password of at most ${PASSWORD_MAX} characters.`);
  if (input.acknowledged !== true) return bad("Please confirm that you understand this is not investment advice.");

  const version = consents.length ? await consentVersion() : null;
  const meta = {
    name,
    ...(version ? { eq_consents: Object.fromEntries(consents.map((scope) => [scope, version])) } : {}),
    eq_ack: { not_investment_advice: true, version: ACK_VERSION, at: new Date().toISOString() },
  };
  const redirect = encodeURIComponent(`${publicOrigin(request)}/`);
  const base = usernameBase(name);
  let username = await freeUsername(base);
  let answer = await supabaseAuth(`/signup?redirect_to=${redirect}`, { email, password, data: { ...meta, username } });
  // Someone took the same username a moment ago (the trigger refused it): once more with a fresh suffix.
  if (answer.status >= 400 && /database error|username|profiles/i.test(String(answer.data.msg ?? answer.data.message ?? ""))) {
    username = withSuffix(base);
    answer = await supabaseAuth(`/signup?redirect_to=${redirect}`, { email, password, data: { ...meta, username } });
  }
  const { status, data } = answer;
  const limited = rateLimitDetail(status, data);
  if (limited) return bad(limited, 429);
  if (data.error_code === "weak_password") {
    return bad("That password is too easy to guess. Choose a longer or less common one.", 422);
  }
  if (status >= 400) return bad("Could not create the account. Please check your details and try again.", 422);

  // Email confirmation switched off in Supabase: the answer already carries a session, so sign the person in.
  const access = await storeSession(data);
  if (access) {
    await afterSignIn(access);
    return Response.json({ status: "signed_in", consents_saved: consents.length === 0 || !!version });
  }
  // The same answer whether or not the email already had an account: this form does not reveal who is registered.
  return Response.json({ status: "confirm_email", consents_saved: consents.length === 0 || !!version });
}
