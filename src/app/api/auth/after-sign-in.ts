import { forwardToBackend } from "@/lib/backend";

// Every way of signing in (login, the confirmation link, sign-up with confirmation off) ends here: the consents the
// person ticked on the sign-up screen wait in their own Supabase user_metadata until this first signed-in moment,
// and the backend records them once (POST /account/signup-consents removes them from the metadata first).
// Best effort: if it fails, the next sign-in tries again, and the account page still offers each consent.

export async function afterSignIn(accessToken: string): Promise<void> {
  await forwardToBackend("/account/signup-consents", {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, timeoutMs: 8_000,
  }).catch(() => undefined);
}
