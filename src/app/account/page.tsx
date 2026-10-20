"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AccountDashboard, type Me } from "@/components/account-dashboard";
import { Sidebar } from "@/components/sidebar";
import { Loader } from "@/components/ui/loader";
import { AccountsOff } from "@/components/welcome/accounts-off";
import { SignedOut } from "@/components/welcome/signed-out";
import { api, detail } from "@/lib/account-api";
import { currentSession } from "@/lib/egoquant";
import { applyPendingAvatar } from "@/lib/profile";

// Accounts. Onboarding starts here: the questionnaire answers, preferences, game result and reports are kept in the
// account (180 days), the trading data a person connects only after they agree, and they can erase it all here.
// ?next=/path (a page of this site) is where a sign-in goes on to; ?tab=signup opens the sign-up steps
// (components/welcome, the same screens as a first visit to the home page).
// Sign-up and login go through our own /api/auth routes (Supabase Auth behind them); the session lives in
// HttpOnly cookies, so nothing on this page can read a token.

type View = { kind: "loading" } | { kind: "out" } | { kind: "off"; message: string } | { kind: "in"; me: Me };

const noSubscribe = () => () => {};
const search = () => window.location.search;

export default function AccountPage() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [notice, setNotice] = useState("");
  // Stable, so the open account section does not fetch again on every re-render of this page.
  const onGone = useCallback((message: string) => { setNotice(message); setView({ kind: "out" }); }, []);
  const router = useRouter();
  const query = useSyncExternalStore(noSubscribe, search, () => "");
  const params = new URLSearchParams(query);
  const confirm = params.get("confirm");
  const rawNext = params.get("next") ?? "";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") ? rawNext : "";

  // Signed in from the form: on to where the person was going, or, before the risk profile, to its start.
  async function signedIn() {
    const destination = next || (currentSession()?.profile ? "" : "/");
    if (destination) router.push(destination);
    else await load();
  }

  async function load() {
    const { status, data } = await api("/api/account/me");
    if (status === 200) setView({ kind: "in", me: data as unknown as Me });
    else if (status === 401) setView({ kind: "out" });
    else setView({ kind: "off", message: detail(data, "Accounts are not available right now.") });
  }

  useEffect(() => {
    let alive = true;
    api("/api/account/me").then(async ({ status, data }) => {
      if (!alive) return;
      // e.g. signed in by the confirmation link: save the sign-up choice, and read the account again only if one was saved
      if (status === 200 && !(data as unknown as Me).avatar && await applyPendingAvatar()) {
        const again = await api("/api/account/me");
        if (alive && again.status === 200) data = again.data;
      }
      if (!alive) return;
      if (status === 200) setView({ kind: "in", me: data as unknown as Me });
      else if (status === 401) setView({ kind: "out" });
      else setView({ kind: "off", message: detail(data, "Accounts are not available right now.") });
    });
    return () => { alive = false; };
  }, []);

  return (
    <main className="flex min-h-screen bg-white md:h-screen md:overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b-2 border-zinc-900 py-4 pl-4 pr-20 md:px-12">
          <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">Account</h1>
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">Your data</span>
        </div>
        <div className={`min-h-0 flex-1 ${view.kind === "out" || view.kind === "off" ? "flex flex-col md:overflow-hidden" : `px-4 py-8 md:px-12 ${view.kind === "in" ? "md:overflow-hidden md:py-6" : "md:overflow-y-auto md:py-10"}`}`}>
          {confirm === "ok" && view.kind === "in" && (
            <p role="status" className="mb-6 max-w-2xl border-l-4 border-zinc-900 pl-4 text-sm font-semibold text-zinc-900">
              Your email is confirmed. You are signed in.
            </p>
          )}
          {confirm === "failed" && view.kind !== "in" && (
            <p role="alert" className="mx-4 mt-6 max-w-2xl shrink-0 border-l-4 border-red-600 pl-4 text-sm text-red-700 md:mx-12">
              That confirmation link did not work. It may have expired or been used already. Log in: if your email is
              not confirmed yet, you can ask for a fresh link there.
            </p>
          )}
          {notice && (
            <p role="status" className={`mb-6 max-w-2xl shrink-0 border-l-4 border-zinc-900 pl-4 text-sm font-semibold text-zinc-900 ${
              view.kind === "out" ? "mx-4 mt-6 md:mx-12" : ""}`}>{notice}</p>
          )}

          {view.kind === "loading" && <Loader label="Loading your account" />}
          {view.kind === "off" && <AccountsOff message={view.message} onRetry={load} />}
          {view.kind === "out" && (
            <div className="flex min-h-0 flex-1 flex-col">
              <SignedOut initial={params.get("tab") === "signup" ? "signup" : "login"} onLoggedIn={() => { setNotice(""); void signedIn(); }} />
            </div>
          )}
          {view.kind === "in" && (
            <AccountDashboard me={view.me} reload={load}
                       onGone={onGone} onNotice={setNotice} />
          )}
        </div>
      </div>
    </main>
  );
}
