"use client";

import { useEffect, useRef, useState } from "react";
import { Loader } from "@/components/ui/loader";
import { api, detail } from "@/lib/account-api";
import { onSignInElsewhere, refreshProfile } from "@/lib/profile";
import { Kicker, Title, delay, quiet } from "./parts";

// "Check your inbox": the person waits here while they open the confirmation link, on this device or another one.
// This tab notices by itself and moves on:
//   - the link opened in another tab of this browser announces the sign-in (lib/profile.ts), at once;
//   - with the password still in memory (never in storage), it tries to log in every LOGIN_EVERY_MS while the tab is
//     visible, and at once when the person comes back to it. Supabase answers "email_not_confirmed" until the link
//     is used, then signs them in;
//   - after a reload the password is gone: it asks /api/auth/me instead (that sees a sign-in made in this browser).
// The pace stays under Supabase's sign-in limit (about 30 per 5 minutes per address) and stops after STOP_AFTER_MS.

const LOGIN_EVERY_MS = 12_000;
const ME_EVERY_MS = 20_000;
const BACKOFF_MS = 30_000;          // after a 429
const MIN_GAP_MS = 4_000;           // between two tries, however they were triggered
const STOP_AFTER_MS = 30 * 60_000;
const RESEND_WAIT_S = 60;

type Watch = "waiting" | "stopped" | "wrong_password";

export function CheckInbox({ email, password, onSignedIn, onChangeEmail, onLogin }: {
  email: string;
  password: string | null;           // null after a reload
  onSignedIn: () => void;
  onChangeEmail: () => void;
  onLogin: () => void;
}) {
  const [watch, setWatch] = useState<Watch>("waiting");
  const [resendIn, setResendIn] = useState(RESEND_WAIT_S);
  const [resent, setResent] = useState("");
  const [resendError, setResendError] = useState("");
  const done = useRef(false);
  const signedIn = useRef(onSignedIn);
  useEffect(() => { signedIn.current = onSignedIn; });

  useEffect(() => {
    if (watch !== "waiting") return;
    let alive = true;
    let busy = false;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();

    const finish = () => {
      if (done.current) return;
      done.current = true;
      signedIn.current();
    };

    async function check() {
      if (!alive || busy || done.current || Date.now() - last < MIN_GAP_MS) return schedule();
      if (Date.now() - startedAt > STOP_AFTER_MS) return setWatch("stopped");
      busy = true;
      last = Date.now();
      let wait = password ? LOGIN_EVERY_MS : ME_EVERY_MS;
      if (password) {
        const { status, data } = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }), timeoutMs: 15_000 });
        if (status === 200) {
          await refreshProfile();
          busy = false;
          return finish();
        }
        if (status === 401 && data.code === "invalid_credentials") {
          busy = false;
          return setWatch("wrong_password");
        }
        if (status === 429) wait = BACKOFF_MS;
      } else if ((await refreshProfile()).state === "in") {
        busy = false;
        return finish();
      }
      busy = false;
      schedule(wait);
    }

    function schedule(wait = password ? LOGIN_EVERY_MS : ME_EVERY_MS) {
      if (!alive) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { if (document.visibilityState === "visible") void check(); else schedule(); }, wait);
    }

    const onBack = () => { if (document.visibilityState === "visible") void check(); };
    const stopListening = onSignInElsewhere(() => {
      void refreshProfile().then((profile) => { if (profile.state === "in") finish(); });
    });
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    schedule(6_000);                      // the email takes a few seconds to arrive anyway
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      stopListening();
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("focus", onBack);
    };
  }, [email, password, watch]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  async function resend() {
    setResent("");
    setResendError("");
    const { status, data } = await api("/api/auth/resend", { method: "POST", body: JSON.stringify({ email }) });
    if (status === 200) {
      setResent("A new link is on its way.");
      setResendIn(RESEND_WAIT_S);
      if (watch === "stopped") setWatch("waiting");
    } else {
      setResendError(detail(data, "Could not send the email. Please try again."));
      if (status === 429) setResendIn(RESEND_WAIT_S);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="h-0.5 shrink-0 bg-zinc-100"><div className="h-full w-full bg-zinc-900" /></div>
      <div className="eq-enter flex min-h-0 flex-1 flex-col justify-center px-6 py-6 md:px-12 md:py-8">
        <div className="w-full max-w-xl">
          <Kicker>Last thing</Kicker>
          <Title>Check your<br />inbox.</Title>
          <div className="eq-rule my-6 h-px bg-zinc-300" />
          <p className="eq-rise text-base leading-relaxed text-zinc-600" style={delay(140)}>
            We sent a link to <span className="break-all font-semibold text-zinc-900">{email}</span>. Open it on any device:
            it signs you in and takes you straight to your risk profile.
          </p>

          <div className="eq-rise mt-8 border-l-4 border-zinc-900 py-2 pl-5" style={delay(220)}>
            {watch === "waiting" ? (
              <>
                <Loader label={password ? "Waiting for you to confirm" : "Waiting for the link"} />
                <p className="mt-2 text-xs text-zinc-400">
                  {password ? "This page continues by itself once you click the link. No need to log in again."
                            : "Opened the link on this device? This page continues by itself. On another device, log in here afterwards."}
                </p>
              </>
            ) : watch === "wrong_password" ? (
              <p role="alert" className="text-sm leading-relaxed text-zinc-700">
                We could not sign you in with this password. If this email already had an account, no new link was
                sent: <button type="button" onClick={onLogin} className="font-semibold text-zinc-900 underline">log in instead</button>.
              </p>
            ) : (
              <p className="text-sm text-zinc-700">
                Still waiting?{" "}
                <button type="button" onClick={() => setWatch("waiting")} className="font-semibold text-zinc-900 underline">Check again</button>
              </p>
            )}
          </div>

          <div className="eq-rise mt-8 flex flex-wrap items-center gap-x-8 gap-y-3" style={delay(300)}>
            <button type="button" onClick={resend} disabled={resendIn > 0} className={quiet}>
              {resendIn > 0 ? `Resend in ${resendIn} s` : "Resend the email"}
            </button>
            <button type="button" onClick={onChangeEmail} className={quiet}>Wrong address?</button>
          </div>
          <p className="mt-3 min-h-5 text-sm" role="status">
            {resendError ? <span className="text-red-600">{resendError}</span> : <span className="text-zinc-500">{resent}</span>}
          </p>
          <p className="mt-2 text-xs text-zinc-400">Nothing after a few minutes? Check your spam folder.</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end border-t border-zinc-100 px-6 py-4 text-sm text-zinc-500 md:px-12">
        <span>Confirmed on another device? <button type="button" onClick={onLogin} className="font-semibold text-zinc-900 underline">Log in</button></span>
      </div>
    </div>
  );
}
