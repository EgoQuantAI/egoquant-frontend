// Who is signed in, asked once and remembered briefly. The session lives in HttpOnly cookies, so the only way to
// know is to ask our own /api/account/me. `null` means a visitor (not signed in, or accounts are not set up).

export type AccountMe = {
  username: string | null;
  name?: string | null;          // from sign-up (older backends leave it out)
  consents: { ibkr_data: boolean; trade_check: boolean };
  n_trades: number;
  n_reports: number;
};

const FRESH_MS = 30_000;
let cache: { at: number; me: AccountMe | null } | null = null;
let inflight: Promise<AccountMe | null> | null = null;

export function forgetAccount() {
  cache = null;
}

export async function currentAccount(): Promise<AccountMe | null> {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.me;
  inflight ??= (async () => {
    let me: AccountMe | null = null;
    try {
      const response = await fetch("/api/account/me", { signal: AbortSignal.timeout(10_000) });
      if (response.ok) me = (await response.json()) as AccountMe;
    } catch {
      // not reachable: treated as a visitor
    }
    cache = { at: Date.now(), me };
    inflight = null;
    return me;
  })();
  return inflight;
}
