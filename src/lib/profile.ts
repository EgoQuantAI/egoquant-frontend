"use client";

import { useEffect, useSyncExternalStore } from "react";
import { SIGNED_OUT_EVENT, api } from "@/lib/account-api";
import { forgetSession, sessionHasOwner, syncWithAccount } from "@/lib/egoquant";
import { SIGNUP_DRAFT_KEY } from "@/lib/signup-rules";

// Who is signed in, for the sidebar on every page: name, username and picture only. One request per page load
// (/api/auth/me answers 200 either way, so a signed-out visitor sees no 401 in the console); the account page
// refreshes it after login, logout, sign-up and a picture change. "in" is set only after the onboarding session in
// this browser agrees with the account's copy (lib/egoquant.ts syncWithAccount), so no page shows a stale one.

export type Profile =
  | { state: "loading" }
  | { state: "out" }
  | { state: "off"; message: string }      // accounts not set up here, or /api/auth/me could not be reached
  | { state: "in"; username: string | null; name: string | null; avatar: string | null };

const LOADING: Profile = { state: "loading" };
let current: Profile = LOADING;
let started = false;
const listeners = new Set<() => void>();

function set(next: Profile) {
  current = next;
  listeners.forEach((listener) => listener());
}

let latest = 0;   // only the most recent check may set the state (the page-load one can answer after a sign-in)

export async function refreshProfile(): Promise<Profile> {
  const mine = ++latest;
  const { status, data } = await api("/api/auth/me");
  if (mine !== latest) return current;
  if (status === 200 && data.signedIn === true) {
    const username = typeof data.username === "string" ? data.username : null;
    const copy = data.onboarding as { status?: unknown; data?: unknown } | undefined;   // read with the profile (api/auth/me)
    const prefetched = copy && typeof copy.status === "number" && copy.data && typeof copy.data === "object"
      ? { status: copy.status, data: copy.data as Record<string, unknown> } : undefined;
    if (username) await syncWithAccount(username, prefetched);
    if (mine !== latest) return current;
    try {
      window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY);   // signed in, however it happened: the sign-up is over
    } catch {
      // nothing stored
    }
    set({
      state: "in", username, name: typeof data.name === "string" && data.name ? data.name : null,
      avatar: typeof data.avatar === "string" ? data.avatar : null,
    });
  } else if (status !== 200 || data.configured === false) {
    // Not "out": a sign-up would fail too. Keep this browser's copy (the session may be fine) and retry later.
    set({
      state: "off",
      message: data.configured === false
        ? "Accounts are not set up on this site yet."
        : "We cannot reach the account service right now.",
    });
  } else {
    if (sessionHasOwner()) forgetSession();   // the session ended: the account keeps the answers, not this browser
    set({ state: "out" });
  }
  return current;
}

// ─── Signed in from another tab ───────────────────────────────────────────────────────────────────────────────
// The confirmation link opens in a new tab and signs the person in there (cookies are shared). That tab announces it,
// and every other open tab of this site (the one waiting on "check your inbox") asks /api/auth/me again at once.
// Only the word "in" is sent: no token, no name.

const CHANNEL = "egoquant-auth";

export function announceSignIn() {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage("in");
    channel.close();
  } catch {
    // no BroadcastChannel: the waiting tab still notices when it is focused again
  }
}

/** Calls `onIn` when another tab says it signed in; returns the unsubscribe. */
export function onSignInElsewhere(onIn: () => void): () => void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => { if (event.data === "in") onIn(); };
    return () => channel.close();
  } catch {
    return () => {};
  }
}

/** The first word of the name, for a greeting ("Ada Lovelace" -> "Ada"); null when there is no name. */
export function firstName(profile: Profile): string | null {
  return profile.state === "in" && profile.name ? profile.name.split(" ")[0] : null;
}

export function signedOut() {
  forgetSession();
  set({ state: "out" });
}

export function useProfile(): Profile {
  const profile = useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => current,
    () => LOADING,
  );
  useEffect(() => {
    if (!started) {
      started = true;
      void refreshProfile();
      window.addEventListener(SIGNED_OUT_EVENT, signedOut);   // any account call that answers 401: the session is over
      onSignInElsewhere(() => { if (current.state !== "in") void refreshProfile(); });
    }
  }, []);
  return profile;
}

// ─── The picture chosen at sign-up ─────────────────────────────────────────────────────────────────────────────
// With email confirmation on, nobody is signed in right after sign-up, so the choice waits in this browser and is
// saved at the first login. Only the picture is kept here, never an email or a password.

const PENDING_KEY = "egoquant.pendingAvatar";

export function keepPendingAvatar(avatar: string) {
  try {
    window.localStorage.setItem(PENDING_KEY, avatar);
  } catch {
    // private window: the person can pick the picture again on the account page
  }
}

/** Save a picture for the signed-in user; true when the backend took it. */
export async function saveAvatar(avatar: string): Promise<{ ok: boolean; message?: string }> {
  const { status, data } = await api("/api/account/avatar", { method: "PUT", body: JSON.stringify({ avatar }) });
  if (status === 200) {
    if (current.state === "in") set({ ...current, avatar });
    return { ok: true };
  }
  return { ok: false, message: typeof data.detail === "string" ? data.detail : "The picture could not be saved." };
}

/** After a login: save the picture chosen at sign-up, if one is waiting. True when a picture was saved. */
export async function applyPendingAvatar(): Promise<boolean> {
  let pending: string | null = null;
  try {
    pending = window.localStorage.getItem(PENDING_KEY);
  } catch {
    return false;
  }
  if (!pending) return false;
  if (!(await saveAvatar(pending)).ok) return false;
  try {
    window.localStorage.removeItem(PENDING_KEY);
  } catch {
    // nothing to clean up then
  }
  return true;
}
