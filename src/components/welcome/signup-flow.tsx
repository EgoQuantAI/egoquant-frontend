"use client";

import { useState } from "react";
import { Busy } from "@/components/build-status";
import { api, detail } from "@/lib/account-api";
import { CONSENT, SCOPES, type Scope } from "@/lib/consent";
import { refreshProfile } from "@/lib/profile";
import { emailProblem, nameProblem, passwordProblem, tidyName } from "@/lib/signup-rules";
import { Field, Go, Kicker, ShowPassword, StepFrame, Tick, Title, delay, primary } from "./parts";

// The first-visit onboarding: welcome, name, email, password, then the agreements, then the account is created.
// One question per screen, Enter moves on, every step has Back and "Log in". The name and email (never the password)
// are kept in this tab's sessionStorage, so a reload comes back to the same step (the password step at the latest).

export const SIGNUP_STEPS = ["welcome", "name", "email", "password", "agree"] as const;
export type SignupStep = (typeof SIGNUP_STEPS)[number];
export type Draft = { name: string; email: string };

// Plain-words summaries for the last screen; the full text (lib/consent.ts) is one click away.
const SUMMARY: Record<Scope, string> = {
  ibkr_data: "Keep the IBKR trades I connect later, for up to 180 days, to study how I behave in market falls.",
  trade_check: "Keep the trades I ask EgoQuant to check, and my decisions, for up to 180 days.",
};

const DOMAIN_TYPOS: Record<string, string> = {
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmial.com": "gmail.com", "gmai.com": "gmail.com",
  "hotmail.co": "hotmail.com", "hotmial.com": "hotmail.com", "outlook.co": "outlook.com", "yahoo.co": "yahoo.com",
  "icloud.co": "icloud.com", "qq.co": "qq.com",
};

function suggestion(email: string): string | null {
  const [user, domain] = email.trim().toLowerCase().split("@");
  return user && domain && DOMAIN_TYPOS[domain] ? `${user}@${DOMAIN_TYPOS[domain]}` : null;
}

export type SignupResult = { kind: "signed_in" } | { kind: "confirm"; email: string; password: string };

export function SignupFlow({ step, go, draft, setDraft, password, setPassword, onDone, onLogin }: {
  step: SignupStep;
  go: (step: SignupStep) => void;
  draft: Draft;
  setDraft: (draft: Draft) => void;
  password: string;
  setPassword: (password: string) => void;
  onDone: (result: SignupResult) => void;
  onLogin: () => void;
}) {
  const [tried, setTried] = useState<Partial<Record<SignupStep, boolean>>>({});
  const [blurred, setBlurred] = useState<Partial<Record<SignupStep, boolean>>>({});
  const [reveal, setReveal] = useState(false);
  const [ack, setAck] = useState(false);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const index = SIGNUP_STEPS.indexOf(step);
  const first = tidyName(draft.name).split(" ")[0];
  const aside = <>Have an account? <button type="button" onClick={onLogin} className="font-semibold text-zinc-900 underline">Log in</button></>;
  const back = index > 0 ? () => { setError(""); go(SIGNUP_STEPS[index - 1]); } : undefined;
  const shown = (s: SignupStep) => !!(tried[s] || blurred[s]);
  const attempt = (s: SignupStep, problem: string, next: SignupStep) => {
    setTried((t) => ({ ...t, [s]: true }));
    if (!problem) go(next);
  };

  async function create() {
    setTried((t) => ({ ...t, agree: true }));
    if (!ack || busy) return;
    // A step may have been skipped by editing the address bar: send the person back to the first one with a problem.
    if (nameProblem(draft.name)) return go("name");
    if (emailProblem(draft.email)) return go("email");
    if (passwordProblem(password)) return go("password");
    setBusy(true);
    setError("");
    const body = { name: tidyName(draft.name), email: draft.email.trim(), password, consents: scopes, acknowledged: true };
    const { status, data } = await api("/api/auth/signup", { method: "POST", body: JSON.stringify(body), timeoutMs: 30_000 });
    if (status === 200 && data.status === "signed_in") {
      await refreshProfile();
      onDone({ kind: "signed_in" });
    } else if (status === 200) {
      onDone({ kind: "confirm", email: body.email, password });
    } else {
      setBusy(false);
      setError(detail(data, "Could not create the account. Please try again."));
    }
  }

  if (step === "welcome") {
    return (
      <StepFrame stepKey={step} position={1} total={SIGNUP_STEPS.length} aside={aside} onSubmit={() => go("name")}>
        <Kicker>EgoQuant · Wealth advisory</Kicker>
        <Title>Welcome.</Title>
        <div className="eq-rule my-6 h-px bg-zinc-300" />
        <p className="eq-rise text-base leading-relaxed text-zinc-600" style={delay(140)}>
          In about ten minutes you get a risk profile, a portfolio built inside its limits, and an independent check of it.
          First, a one-minute account, so your answers are kept and you can pick up on any device.
        </p>
        <ol className="eq-rise mt-6 hidden gap-x-6 gap-y-1 text-xs text-zinc-500 sm:grid sm:grid-cols-2" style={delay(180)}>
          {["Your name", "Your email", "A password", "Your agreements"].map((label, i) => (
            <li key={label} className="flex items-baseline gap-2">
              <span className="font-heading text-base text-zinc-300">{i + 1}</span>{label}
            </li>
          ))}
        </ol>
        <div className="mt-8"><Go label="Let's begin" /></div>
      </StepFrame>
    );
  }

  if (step === "name") {
    const problem = nameProblem(draft.name);
    return (
      <StepFrame stepKey={step} position={2} total={SIGNUP_STEPS.length} onBack={back} aside={aside}
                 onSubmit={() => attempt("name", problem, "email")}>
        <Kicker>About you</Kicker>
        <Title>What should we<br />call you?</Title>
        <Field label="Your name" value={draft.name} autoComplete="given-name" placeholder="e.g. Alex" maxLength={60}
               onChange={(name) => setDraft({ ...draft, name })} problem={problem} shown={shown("name")}
               onBlur={() => draft.name && setBlurred((b) => ({ ...b, name: true }))}
               note={draft.name && !problem ? `Nice to meet you, ${first}.` : "A first name is enough."} />
        <Go label="Continue" />
      </StepFrame>
    );
  }

  if (step === "email") {
    const problem = emailProblem(draft.email);
    const better = suggestion(draft.email);
    return (
      <StepFrame stepKey={step} position={3} total={SIGNUP_STEPS.length} onBack={back} aside={aside}
                 onSubmit={() => attempt("email", problem, "password")}>
        <Kicker>{first ? `Thanks, ${first}` : "Your account"}</Kicker>
        <Title>Your email<br />address?</Title>
        <Field label="Email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com"
               value={draft.email} onChange={(email) => setDraft({ ...draft, email })} problem={problem}
               shown={shown("email")} onBlur={() => draft.email && setBlurred((b) => ({ ...b, email: true }))}
               note={better ? (
                 <>Did you mean{" "}
                   <button type="button" onClick={() => setDraft({ ...draft, email: better })}
                           className="font-semibold text-zinc-900 underline">{better}</button>?</>
               ) : "We send one link to confirm it. No newsletters."} />
        <Go label="Continue" />
      </StepFrame>
    );
  }

  if (step === "password") {
    const problem = passwordProblem(password);
    const progress = Math.min(password.length / 10, 1);
    return (
      <StepFrame stepKey={step} position={4} total={SIGNUP_STEPS.length} onBack={back} aside={aside}
                 onSubmit={() => attempt("password", problem, "agree")}>
        <Kicker>Keep it safe</Kicker>
        <Title>Choose a<br />password.</Title>
        <Field label="Password" type={reveal ? "text" : "password"} autoComplete="new-password" value={password}
               onChange={setPassword} problem={problem} shown={shown("password")}
               onBlur={() => password && setBlurred((b) => ({ ...b, password: true }))}
               trailing={<ShowPassword shown={reveal} onToggle={() => setReveal(!reveal)} />}
               note={problem ? "At least 10 characters. A short sentence works well." : "Good. We never store your password."} />
        <div aria-hidden="true" className="-mt-1 mb-6 h-0.5 w-full max-w-xs bg-zinc-100">
          <div className={`h-full transition-all duration-300 ${progress === 1 ? "bg-zinc-900" : "bg-zinc-400"}`}
               style={{ width: `${progress * 100}%` }} />
        </div>
        <Go label="Continue" />
      </StepFrame>
    );
  }

  // agree
  const all = ack && scopes.length === SCOPES.length;
  return (
    <StepFrame stepKey={step} position={5} total={SIGNUP_STEPS.length} onBack={busy ? undefined : back} aside={aside} onSubmit={create}>
      <Kicker>Last step</Kicker>
      <Title>Before we start.</Title>
      <div className="eq-rise mt-6 flex flex-col gap-2" style={delay(140)}>
        <Tick checked={ack} onChange={(v) => { setAck(v); setError(""); }} required>
          I understand that EgoQuant is a prototype: <span className="font-semibold">nothing here is investment advice</span>,
          and no real money moves. I will answer as if it were my own money.
        </Tick>
        {SCOPES.map((scope) => (
          <Tick key={scope} checked={scopes.includes(scope)} details={CONSENT[scope].text}
                onChange={(v) => setScopes((list) => (v ? [...list.filter((s) => s !== scope), scope] : list.filter((s) => s !== scope)))}>
            <span className="font-semibold">{CONSENT[scope].title}.</span> {SUMMARY[scope]}
          </Tick>
        ))}
      </div>
      <div className="eq-rise mt-2 flex items-center justify-between gap-4" style={delay(180)}>
        <p className="text-xs leading-relaxed text-zinc-400">
          Your answers and profile are kept in your account for up to 180 days. Change or delete anything on the account page.
        </p>
        {!all && (
          <button type="button" onClick={() => { setAck(true); setScopes([...SCOPES]); setError(""); }}
                  className="shrink-0 text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
            Tick all
          </button>
        )}
      </div>
      <p role="alert" className="mt-3 min-h-5 text-sm text-red-600">
        {error || (tried.agree && !ack ? "Please tick the first box to continue." : "")}
      </p>
      <button type="submit" disabled={busy} aria-disabled={!ack}
              className={`${primary} ${ack ? "" : "opacity-40"}`}>
        {busy ? <Busy label="Creating your account" /> : <>Create account <span className="eq-arrow">→</span></>}
      </button>
    </StepFrame>
  );
}

