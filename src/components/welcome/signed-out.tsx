"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SIGNUP_DRAFT_KEY, emailProblem, nameProblem, passwordProblem } from "@/lib/signup-rules";
import { CheckInbox } from "./check-inbox";
import { LoginForm } from "./login-form";
import { type Draft, SIGNUP_STEPS, type SignupResult, type SignupStep, SignupFlow } from "./signup-flow";

// Everything a signed-out visitor sees: the sign-up steps (first visit), the login, and the "check your inbox" wait.
// Each screen is a browser history entry (?step=...), so Back and Forward in the browser move between steps.
// The name and email (never the password) are kept in this tab's sessionStorage, so a reload returns to the same
// step; a step whose earlier answers are missing (or the password, which lives only in memory) falls back to the
// first one that needs an answer.

type Screen = SignupStep | "login" | "inbox";
type Saved = Draft & { inbox?: string };

const KEY = SIGNUP_DRAFT_KEY;
const SCREENS: Screen[] = [...SIGNUP_STEPS, "login", "inbox"];

function readSaved(): Saved {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(KEY) ?? "{}");
    return {
      name: typeof raw.name === "string" ? raw.name : "",
      email: typeof raw.email === "string" ? raw.email : "",
      ...(typeof raw.inbox === "string" ? { inbox: raw.inbox } : {}),
    };
  } catch {
    return { name: "", email: "" };
  }
}

function writeSaved(saved: Saved | null) {
  try {
    if (saved) window.sessionStorage.setItem(KEY, JSON.stringify(saved));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // storage blocked: a reload starts over, nothing else changes
  }
}

function screenInUrl(): Screen | null {
  const step = new URLSearchParams(window.location.search).get("step");
  return SCREENS.includes(step as Screen) ? (step as Screen) : null;
}

/** The furthest screen the answers so far allow (`wanted` when they allow it). */
function allowed(wanted: Screen, draft: Draft, password: string, inbox: { email: string } | null): Screen {
  if (wanted === "login" || wanted === "welcome") return wanted;
  if (wanted === "inbox") return inbox ? "inbox" : "agree";
  const order: SignupStep[] = ["name", "email", "password", "agree"];
  const missing = order.find((step, i) => i < order.indexOf(wanted) && (
    (step === "name" && nameProblem(draft.name)) || (step === "email" && emailProblem(draft.email)) ||
    (step === "password" && passwordProblem(password))));
  return missing ?? wanted;
}

export function SignedOut({ initial, onLoggedIn }: {
  initial: "signup" | "login";
  onLoggedIn?: () => void;               // default: stay on this page, which then shows the signed-in view
}) {
  const router = useRouter();
  const [draft, setDraftState] = useState<Draft>(() => {
    const saved = readSaved();
    return { name: saved.name, email: saved.email };
  });
  const [password, setPassword] = useState("");     // memory only
  const [inbox, setInbox] = useState<{ email: string; password: string | null } | null>(() => {
    const saved = readSaved();
    return saved.inbox ? { email: saved.inbox, password: null } : null;
  });
  const [screen, setScreen] = useState<Screen>(() => {
    const fromUrl = screenInUrl();
    const saved = readSaved();
    const wanted = fromUrl ?? (saved.inbox ? "inbox" : initial === "login" ? "login" : "welcome");
    return allowed(wanted, saved, "", saved.inbox ? { email: saved.inbox } : null);
  });
  const [loginEmail, setLoginEmail] = useState(draft.email);

  function setDraft(next: Draft) {
    setDraftState(next);
    writeSaved({ ...next, ...(inbox ? { inbox: inbox.email } : {}) });
  }

  // The screen in the address bar, without a new entry for the first one.
  useEffect(() => {
    if (screenInUrl() !== screen) replaceUrl(screen);
    // only on mount: later moves push their own entries
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPop = () => {
      const wanted = screenInUrl() ?? (initial === "login" ? "login" : "welcome");
      const next = allowed(wanted, draft, password, inbox);
      setScreen(next);
      if (next !== wanted) replaceUrl(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [draft, password, inbox, initial]);

  function go(next: Screen) {
    setScreen(next);
    const params = new URLSearchParams(window.location.search);
    params.set("step", next);
    window.history.pushState(null, "", `${window.location.pathname}?${params}`);
  }

  function finished(destination: string | null) {
    writeSaved(null);
    setPassword("");
    if (destination) router.replace(destination);
  }

  function signupDone(result: SignupResult) {
    if (result.kind === "signed_in") return finished("/questionnaire?welcome=new");
    const waiting = { email: result.email, password: result.password };
    setInbox(waiting);
    writeSaved({ ...draft, inbox: result.email });
    go("inbox");
  }

  function loggedIn() {
    if (onLoggedIn) {
      finished(null);
      onLoggedIn();
    } else {
      finished(window.location.pathname);          // drop ?step=...; the page now shows the signed-in view
    }
  }

  if (screen === "inbox" && inbox) {
    return (
      <CheckInbox email={inbox.email} password={inbox.password}
                  onSignedIn={() => finished("/questionnaire?welcome=confirmed")}
                  onChangeEmail={() => { setInbox(null); writeSaved(draft); go("email"); }}
                  onLogin={() => { setLoginEmail(inbox.email); go("login"); }} />
    );
  }
  if (screen === "login") {
    return (
      <LoginForm email={loginEmail} setEmail={setLoginEmail} onSignedIn={loggedIn} onSignup={() => go("welcome")}
                 onUnconfirmed={(email, pass) => {
                   setInbox({ email, password: pass });
                   writeSaved({ ...draft, inbox: email });
                   go("inbox");
                 }} />
    );
  }
  return (
    <SignupFlow step={screen === "inbox" ? "agree" : screen} go={go} draft={draft} setDraft={setDraft}
                password={password} setPassword={setPassword} onDone={signupDone}
                onLogin={() => { setLoginEmail(draft.email); go("login"); }} />
  );
}

function replaceUrl(screen: Screen) {
  const params = new URLSearchParams(window.location.search);
  params.set("step", screen);
  window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
}
