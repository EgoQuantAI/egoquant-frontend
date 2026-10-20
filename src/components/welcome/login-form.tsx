"use client";

import { useState } from "react";
import { api, detail } from "@/lib/account-api";
import { applyPendingAvatar, refreshProfile } from "@/lib/profile";
import { EMAIL } from "@/lib/signup-rules";
import { Field, Go, Kicker, ShowPassword, StepFrame, Title } from "./parts";

// Log in, for returning users: one screen, Enter logs in. An email that is not confirmed yet goes to the
// "check your inbox" wait (with the password in memory, so it continues by itself) and can ask for a fresh link.

export function LoginForm({ email, setEmail, onSignedIn, onUnconfirmed, onSignup }: {
  email: string;
  setEmail: (email: string) => void;
  onSignedIn: () => void;
  onUnconfirmed: (email: string, password: string) => void;
  onSignup: () => void;
}) {
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const emailProblem = !email.trim() ? "Enter your email address." : !EMAIL.test(email.trim()) ? "Check the email address for a typo." : "";
  const passwordProblem = password ? "" : "Enter your password.";

  async function submit() {
    setTried(true);
    if (emailProblem || passwordProblem || busy) return;
    setBusy(true);
    setError("");
    const { status, data } = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: email.trim(), password }) });
    if (status === 200) {
      await applyPendingAvatar();          // a picture chosen with the old sign-up form, if one still waits
      await refreshProfile();
      onSignedIn();
      return;
    }
    setBusy(false);
    if (status === 403 && data.code === "email_not_confirmed") return onUnconfirmed(email.trim(), password);
    setError(detail(data, "Could not log in. Please try again."));
  }

  return (
    <StepFrame stepKey="login" position={0} total={1} onSubmit={submit}
               aside={<>New here? <button type="button" onClick={onSignup} className="font-semibold text-zinc-900 underline">Create an account</button></>}>
      <Kicker>Welcome back</Kicker>
      <Title>Log in.</Title>
      <Field label="Email" type="email" inputMode="email" autoComplete="email" value={email} autoFocus={!email}
             onChange={(v) => { setEmail(v); setError(""); }} problem={emailProblem} shown={tried} />
      <div className="-mt-6">
        <Field label="Password" type={reveal ? "text" : "password"} autoComplete="current-password" value={password} autoFocus={!!email}
               onChange={(v) => { setPassword(v); setError(""); }} problem={error || passwordProblem} shown={tried || !!error}
               trailing={<ShowPassword shown={reveal} onToggle={() => setReveal(!reveal)} />} />
      </div>
      <Go label="Log in" busy={busy} busyLabel="Logging in" />
    </StepFrame>
  );
}
