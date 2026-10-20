"use client";

import { useEffect, useState } from "react";
import { Loader } from "@/components/ui/loader";
import { refreshProfile } from "@/lib/profile";
import { quiet } from "./parts";

// When accounts cannot be used (not set up here, or the account service is down), onboarding cannot start: the
// answers are kept in the account. Say so plainly, instead of a sign-up that would fail, and keep trying.

const RETRY_MS = 15_000;

export function AccountsOff({ message, onRetry = refreshProfile }: {
  message: string;
  onRetry?: () => Promise<unknown>;    // the account page reloads its own view; elsewhere, the sign-in state
}) {
  const [checking, setChecking] = useState(false);

  async function retry() {
    if (checking) return;
    setChecking(true);
    await onRetry();                       // "in" or "out" replaces this screen by itself
    setChecking(false);
  }

  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") void onRetry(); }, RETRY_MS);
    return () => clearInterval(timer);
  }, [onRetry]);

  return (
    <div className="flex h-full flex-col justify-center px-6 py-8 md:px-12">
      <div className="max-w-xl">
        <p className="eq-rise font-heading text-4xl leading-[1.1] text-zinc-900 md:text-5xl">Back in<br />a moment.</p>
        <div className="eq-rule my-6 h-px bg-zinc-300" />
        <p role="alert" className="text-base leading-relaxed text-zinc-600">
          {message} Your risk profile and portfolio are kept in your account, so sign-up and login have to work
          first. Nothing you entered is lost.
        </p>
        <div className="mt-8 flex items-center gap-6">
          {checking ? <Loader label="Checking" /> : <button type="button" onClick={retry} className={quiet}>Try again</button>}
          <span className="text-xs text-zinc-400">We also retry by ourselves every few seconds.</span>
        </div>
      </div>
    </div>
  );
}
