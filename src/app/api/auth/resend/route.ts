import { readLimitedBody } from "@/lib/backend";
import {
  EMAIL, authConfigured, forbidden, notConfigured, publicOrigin, rateLimitDetail, sameOrigin, supabaseAuth, tooManyAttempts,
} from "@/lib/server-auth";

// Send the confirmation email again ("check your inbox" screen, or a login with an unconfirmed email). The answer is
// the same whether or not the address has an account. Supabase itself allows one email per address a minute.

const bad = (detail: string, status = 400) => Response.json({ detail }, { status });

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  if (!authConfigured()) return notConfigured();
  if (tooManyAttempts(request, "resend", 3)) return bad("Please wait a minute before asking again.", 429);

  const raw = await readLimitedBody(request, 1_000);
  let email = "";
  try {
    const input = raw ? JSON.parse(raw) : {};
    email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  } catch {
    return bad("Invalid request.");
  }
  if (!EMAIL.test(email)) return bad("Enter a valid email address.");
  const redirect = encodeURIComponent(`${publicOrigin(request)}/`);
  const { status, data } = await supabaseAuth(`/resend?redirect_to=${redirect}`, { type: "signup", email });
  const limited = rateLimitDetail(status, data);
  if (limited) return bad(limited, 429);
  return Response.json({ ok: true });
}
