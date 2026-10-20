import { cookies } from "next/headers";

// Server side only (Route Handlers). Sign-in uses Supabase Auth, called from here, never from the browser:
// the tokens live in HttpOnly cookies, so page scripts cannot read them, and every state-changing /api route
// checks that the request came from our own site (CSRF). The backend verifies the access token again and
// reads and writes the user's rows with it, so Row-Level Security applies. No service-role key anywhere.

const production = process.env.NODE_ENV === "production";
// "__Host-" cookies must be Secure, Path=/ and have no Domain: the browser then refuses to let any other
// site or subdomain overwrite them. Plain names on http://localhost, where Secure cookies are not set.
export const ACCESS = production ? "__Host-eq_at" : "eq_at";
export const REFRESH = production ? "__Host-eq_rt" : "eq_rt";
const REFRESH_DAYS = 7;

const supabaseUrl = () => (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const authConfigured = () => supabaseUrl().startsWith("https://") && anonKey() !== "";

export const notConfigured = () =>
  Response.json({ detail: "Accounts are not set up on this site yet." }, { status: 503 });

/** True when the browser says the request came from our own origin (blocks cross-site form posts and fetches). */
export function sameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const forbidden = () => Response.json({ detail: "This request was blocked." }, { status: 403 });

/** The public origin of this site as the visitor sees it (behind Vercel's proxy request.url can be internal). */
export function publicOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  const proto = request.headers.get("x-forwarded-proto") ?? (production ? "https" : "http");
  return `${proto}://${host}`;
}

// Best effort per-instance limit on sign-up and login (Supabase has its own, stricter, limits behind it).
const hits = new Map<string, number[]>();
export function tooManyAttempts(request: Request, scope: string, limit = 10, windowMs = 60_000): boolean {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > limit;
}

export type Tokens = { access: string | null; refresh: string | null };

export async function readTokens(): Promise<Tokens> {
  const store = await cookies();
  return { access: store.get(ACCESS)?.value ?? null, refresh: store.get(REFRESH)?.value ?? null };
}

export async function storeTokens(session: { access_token: string; refresh_token: string; expires_in?: number }) {
  const store = await cookies();
  const base = { httpOnly: true, secure: production, sameSite: "lax" as const, path: "/" };
  store.set(ACCESS, session.access_token, { ...base, maxAge: Math.min(session.expires_in ?? 3600, 86_400) });
  store.set(REFRESH, session.refresh_token, { ...base, maxAge: REFRESH_DAYS * 86_400 });
}

export async function clearTokens() {
  const store = await cookies();
  store.delete(ACCESS);
  store.delete(REFRESH);
}

/** Supabase refused with a rate limit: which one? Its per-address cooldown ("you can only request this after 59 seconds") is over in
 *  a minute. The project's e-mail sender, though, allows only a few confirmation e-mails per HOUR, and then nobody can sign up until
 *  it resets: say that, and point to the demo account. Null when the answer is not a rate limit. (Our own limiter's
 *  "wait a minute" text stays for our own limiter, tooManyAttempts.) */
export function rateLimitDetail(status: number, data: Record<string, unknown>): string | null {
  const text = String(data.msg ?? data.message ?? data.error_description ?? "");
  const code = String(data.error_code ?? "");
  if (status !== 429 && code !== "over_email_send_rate_limit") return null;
  if (/after \d+ seconds?/i.test(text)) return "An email was sent a moment ago. Please wait a minute before asking again.";
  if (code === "over_email_send_rate_limit" || /email rate limit/i.test(text)) {
    return "Sign-ups are paused for a short while because our email sender allows only a few confirmation emails per hour. Please try again later, or use the demo account from the submission.";
  }
  return "Too many requests in a short time. Please wait a few minutes and try again.";
}

type AuthAnswer = { status: number; data: Record<string, unknown> };

/** One call to Supabase Auth (GoTrue). The answer is returned as data; nothing here is logged. */
export async function supabaseAuth(path: string, body: unknown, accessToken?: string): Promise<AuthAnswer> {
  try {
    const response = await fetch(`${supabaseUrl()}/auth/v1${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey(),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      // an empty body (logout) is fine
    }
    return { status: response.status, data };
  } catch {
    return { status: 502, data: {} };
  }
}

/** Who an access token belongs to (GET /auth/v1/user). Used to check tokens that arrive from a confirmation link. */
export async function supabaseUser(accessToken: string): Promise<AuthAnswer> {
  try {
    const response = await fetch(`${supabaseUrl()}/auth/v1/user`, {
      headers: { apikey: anonKey(), Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, data: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return { status: 502, data: {} };
  }
}

/** A Supabase answer that carries a session: store it and return the access token; null when it carries none. */
export async function storeSession(data: Record<string, unknown>): Promise<string | null> {
  if (typeof data.access_token !== "string" || typeof data.refresh_token !== "string") return null;
  await storeTokens({
    access_token: data.access_token, refresh_token: data.refresh_token,
    expires_in: typeof data.expires_in === "number" ? data.expires_in : undefined,
  });
  return data.access_token;
}

/** Supabase's "this email is not confirmed yet" (newer error_code, or the older error_description wording). */
export const notConfirmed = (data: Record<string, unknown>) =>
  data.error_code === "email_not_confirmed" || /not confirmed/i.test(String(data.error_description ?? data.msg ?? ""));

/** The name chosen at sign-up, from the access token's user_metadata claim. Display only: call it only for a token
 *  the backend has just accepted (it verifies the signature; this does not). */
export function nameInToken(accessToken: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8"));
    const name = payload?.user_metadata?.name;
    return typeof name === "string" && name.trim() ? name.trim().slice(0, 40) : null;
  } catch {
    return null;
  }
}

/** Trade the refresh cookie for a new session, store it, and return the new access token (or null). */
export async function refreshSession(refresh: string): Promise<string | null> {
  const { status, data } = await supabaseAuth("/token?grant_type=refresh_token", { refresh_token: refresh });
  if (status !== 200 || typeof data.access_token !== "string" || typeof data.refresh_token !== "string") {
    await clearTokens();
    return null;
  }
  await storeTokens({
    access_token: data.access_token, refresh_token: data.refresh_token,
    expires_in: typeof data.expires_in === "number" ? data.expires_in : undefined,
  });
  return data.access_token;
}

export { EMAIL, NAME, PASSWORD_MAX, PASSWORD_MIN, tidyName } from "@/lib/signup-rules";
export const USERNAME = /^[a-z0-9_]{3,20}$/;
