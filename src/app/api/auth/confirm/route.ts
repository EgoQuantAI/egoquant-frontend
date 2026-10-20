import { authConfigured, publicOrigin, storeSession, supabaseAuth } from "@/lib/server-auth";
import { afterSignIn } from "../after-sign-in";

// The confirmation link when the email template is set to
// {{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=signup  (see the onboarding notes for Umut).
// It signs the person in (no second login), records the consents ticked at sign-up and goes straight on to the
// questionnaire. A used or expired link lands on the account page with a plain "could not confirm" message.
// (Supabase's default template instead comes back to the site's root with tokens in the URL fragment; that path is
// handled by components/email-confirmed.tsx and ../session.)

const TYPES = new Set(["signup", "email"]);

export async function GET(request: Request) {
  const here = new URL(request.url);
  const tokenHash = here.searchParams.get("token_hash") ?? "";
  const type = here.searchParams.get("type") ?? "";
  const go = (path: string) => Response.redirect(`${publicOrigin(request)}${path}`, 303);

  if (!authConfigured() || !TYPES.has(type) || !/^[A-Za-z0-9_-]{8,200}$/.test(tokenHash)) return go("/account?confirm=failed");
  const { status, data } = await supabaseAuth("/verify", { type, token_hash: tokenHash });
  const access = status === 200 ? await storeSession(data) : null;
  if (!access) return go("/account?confirm=failed");
  await afterSignIn(access);
  return go("/questionnaire?welcome=confirmed");
}
