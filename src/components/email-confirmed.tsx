"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/account-api";
import { announceSignIn, refreshProfile } from "@/lib/profile";

// Supabase's default confirmation email sends the person back to the site's root with the result in the URL
// FRAGMENT: "#access_token=...&refresh_token=...&type=signup" when the address was confirmed,
// "#error=...&error_code=otp_expired&..." when the link was used already or has expired.
// The fragment is read once and the address bar is cleaned at once (it carries a live session). The two tokens are
// posted once to /api/auth/session, which checks them, swaps them for a fresh session in HttpOnly cookies and records
// the consents ticked at sign-up. Then the person goes straight on to the questionnaire: no second login. Nothing from
// the fragment is stored or shown. (A template with {{ .TokenHash }} uses /api/auth/confirm instead; same result.)

export type ConfirmLink = "none" | "working" | "expired" | "failed";

let state: ConfirmLink = "none";
let tokens: { access_token: string; refresh_token: string } | null = null;
let loaded = false;
let started = false;
const listeners = new Set<() => void>();

function set(next: ConfirmLink) {
  state = next;
  listeners.forEach((listener) => listener());
}

function parse(hash: string): ConfirmLink {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const access = params.get("access_token");
  const refresh = params.get("refresh_token");
  if (access && refresh && ["signup", "email", "magiclink"].includes(params.get("type") ?? "")) {
    tokens = { access_token: access, refresh_token: refresh };
    return "working";
  }
  if (params.has("error_code") || (params.has("error") && params.has("error_description"))) {
    return params.get("error_code") === "otp_expired" ? "expired" : "failed";
  }
  return "none";
}

function snapshot(): ConfirmLink {
  if (!loaded) {
    loaded = true;                                 // once per page load
    state = parse(window.location.hash);
    if (state !== "none") window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  }
  return state;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

/** Whether this page was opened by a confirmation link, and what became of it. "working" until the person is
 *  signed in and on the way to the questionnaire, so the page can show a loader instead of the sign-up screens. */
export function useConfirmLink(): ConfirmLink {
  const current = useSyncExternalStore(subscribe, snapshot, () => "none" as ConfirmLink);
  const router = useRouter();
  useEffect(() => {
    if (current !== "working" || started || !tokens) return;
    started = true;                                // once, even when React runs effects twice
    const body = JSON.stringify(tokens);
    tokens = null;
    void api("/api/auth/session", { method: "POST", body, timeoutMs: 20_000 }).then(async ({ status }) => {
      if (status !== 200) return set("expired");
      const profile = await refreshProfile();
      if (profile.state !== "in") return set("failed");
      announceSignIn();                            // the tab that waits on "check your inbox" moves on too
      router.replace("/questionnaire?welcome=confirmed");
    });
  }, [current, router]);
  return current;
}

export function dismissConfirmNote() {
  set("none");
}

const TEXT: Record<"expired" | "failed", string> = {
  expired: "That confirmation link has expired or was already used.",
  failed: "That confirmation link could not be used.",
};

/** The one-line note when the link did not work; the sign-up screens stay below it. */
export function EmailConfirmedNote({ link }: { link: ConfirmLink }) {
  if (link !== "expired" && link !== "failed") return null;
  return (
    <div role="alert"
         className="eq-rise flex shrink-0 items-start justify-between gap-6 border-b border-zinc-200 bg-zinc-50 px-6 py-3 md:px-12">
      <p className="text-sm leading-relaxed text-zinc-700">
        <span className="font-semibold text-zinc-900">{TEXT[link]}</span>{" "}
        If you confirmed already, just log in. If not, log in anyway and we will send you a fresh link.{" "}
        <Link href="/account" className="font-semibold text-zinc-900 underline">Log in</Link>
      </p>
      <button type="button" onClick={dismissConfirmNote}
              className="shrink-0 text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
        Close
      </button>
    </div>
  );
}
