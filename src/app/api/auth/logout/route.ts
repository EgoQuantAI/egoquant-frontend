import { authConfigured, clearTokens, forbidden, readTokens, sameOrigin, supabaseAuth } from "@/lib/server-auth";

// Log out: end this browser's session at Supabase (other devices stay signed in) and drop the cookies.

export async function POST(request: Request) {
  if (!sameOrigin(request)) return forbidden();
  const { access } = await readTokens();
  if (access && authConfigured()) await supabaseAuth("/logout?scope=local", undefined, access);
  await clearTokens();
  return Response.json({ ok: true });
}
