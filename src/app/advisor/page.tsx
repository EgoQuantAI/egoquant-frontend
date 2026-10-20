"use client";

import Link from "next/link";
import { FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { TradeCheck } from "@/components/trade-check";
import { TradeCheckCard } from "@/components/trade-check-card";
import { AdvisorAvatar, Avatar } from "@/components/avatar";
import { Markdown } from "@/components/markdown";
import { Sidebar } from "@/components/sidebar";
import { Loader } from "@/components/ui/loader";
import { PrivacyNote, WhatIfCard } from "@/components/what-if-card";
import { type Session, label, pct, priceLine, useSession } from "@/lib/egoquant";
import { advisorGreeting } from "@/lib/greeting";
import { failureMessage, genericFailure, statusMessage } from "@/lib/http-errors";
import { firstName, useProfile } from "@/lib/profile";
import { type ChatTradeCheck, tradeChecksList } from "@/lib/trade-check";
import { type WhatIfResult, addPrivacy, chatSessionId, readPrivacy, whatIfList } from "@/lib/what-if";

type Message = { role: "user" | "assistant"; content: string; filtered?: boolean; what_if?: WhatIfResult[]; trade_checks?: ChatTradeCheck[] };
type Grounding = { profile: boolean; portfolio: boolean; notices: string[] };

// The backend accepts at most 30 messages and 30,000 characters; older turns are dropped first.
const MAX_MESSAGES = 30;
const MAX_CHARS = 28_000;
const CHAT_KEY = "egoquant.advisor.chat.v1";

/** Questions to start with, from what is saved (the backend sends better ones after each reply). */
function starterQuestions(session: Session | null): string[] {
  const result = session?.result;
  if (result) {
    const top = [...result.report.allocation].sort((a, b) => b.weight - a.weight)[0];
    return [
      ...(result.approved ? [] : ["Why did the Risk Engine not approve my portfolio?"]),
      ...(top ? [`Why is ${top.asset_id} my largest holding?`] : []),
      ...(result.goal ? ["How likely am I to reach my goal, and what drives that?"] : []),
      "What happens to my portfolio in the worst stress scenario?",
      "Which of my limits came from my risk profile?",
    ].slice(0, 4);
  }
  if (session?.profile) {
    return [
      `What does ${session.profile.c_level} mean for me?`,
      "Which side limited my risk category, and why?",
      "What happens when I build my portfolio?",
    ];
  }
  return [
    "How does EgoQuant build a portfolio?",
    "What is the difference between my attitude to risk and my capacity for loss?",
    "What is diversification?",
  ];
}

/** The most recent turns that fit the backend's limits. */
function recent(history: Message[]): { role: Message["role"]; content: string }[] {
  const out: { role: Message["role"]; content: string }[] = [];
  let chars = 0;
  for (let i = history.length - 1; i >= 0 && out.length < MAX_MESSAGES; i--) {
    chars += history[i].content.length;
    if (chars > MAX_CHARS && out.length > 0) break;
    out.unshift({ role: history[i].role, content: history[i].content.slice(0, 4000) });
  }
  return out;
}

function loadChat(): Message[] {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(CHAT_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((m) => m && typeof m.content === "string") : [];
  } catch {
    return [];
  }
}

function saveChat(messages: Message[]) {
  try {
    window.sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-60)));
  } catch {
    // storage blocked: the chat still works for this page view
  }
}

/** "2026-10-09T23:59:59.999999Z" -> "9 Oct 2026" (the date part only, read as written: no time-zone shift). */
function shortDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export default function AdvisorPage() {
  const session = useSession();
  const profile = useProfile();
  const greeting = advisorGreeting(firstName(profile));   // the first line of every chat; shown here only, never sent to the chat
  const myPicture = profile.state === "in" ? profile.avatar : null;   // shown next to the person's own messages
  const currency = session?.result?.report.currency ?? "USD";
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [grounding, setGrounding] = useState<Grounding | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [hidden, setHidden] = useState(0);
  const end = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const loaded = useRef(false);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  useEffect(() => {
    if (loaded.current) saveChat(messages.filter((m) => m.content));
  }, [messages]);

  const send = useCallback(async (text: string, base?: Message[], tradeContext?: string) => {
    const content = text.trim();
    if (!content || busy.current) return;
    const history: Message[] = [...(base ?? loadChat()), { role: "user", content }];
    busy.current = true;
    setPending(true);
    setError("");
    setSuggestions([]);
    setMessages([...history, { role: "assistant", content: "" }]);
    setDraft("");

    const s = sessionRef.current;
    const controller = new AbortController();
    abort.current = controller;
    let reply = "";
    let whatIf: WhatIfResult[] = [];
    let trades: ChatTradeCheck[] = [];
    const show = (filtered?: boolean) =>
      setMessages([...history, {
        role: "assistant", content: reply, filtered,
        ...(whatIf.length ? { what_if: whatIf } : {}), ...(trades.length ? { trade_checks: trades } : {}),
      }]);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: recent(history),
          answers: s?.answers ?? null,
          portfolio_context: s?.result?.chat_context ?? null,
          ...(tradeContext ? { trade_context: tradeContext } : {}),   // the sealed trade check from /trade-check: the chat only explains it
          what_if_context: s?.result?.what_if_context ?? null,
          session_id: chatSessionId(),
          page: "advisor",
        }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
      });
      if (response.status === 404) {
        // A backend without the streaming advisor yet: plain chat, no grounding
        const data = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: recent(history) }),
          signal: controller.signal,
        }).then((r) => r.json());
        if (typeof data?.reply !== "string") throw new Error(typeof data?.detail === "string" ? data.detail : "Unable to send this message.");
        reply = data.reply;
        trades = tradeChecksList(data.trade_checks);
        show();
        return;
      }
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        // The chat's own sentence first (it knows about credit and quota); the generic wording only when it said nothing.
        throw new Error((typeof data?.detail === "string" && data.detail.trim() ? data.detail : null) ?? statusMessage(response.status) ?? genericFailure(response.status));
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          const name = raw.match(/^event: (.*)$/m)?.[1];
          const data = raw.match(/^data: (.*)$/m)?.[1];
          if (!name || !data) continue;
          const payload = JSON.parse(data);
          if (name === "meta") {
            setGrounding(payload.grounding);
            setSuggestions(payload.suggestions ?? []);
          } else if (name === "delta") {
            reply += payload.text;
            show();
          } else if (name === "done") {
            reply = payload.reply;
            whatIf = whatIfList(payload.what_if);
            trades = tradeChecksList(payload.trade_checks);
            setHidden(addPrivacy(payload.privacy));
            show(payload.filtered);
            finished = true;
          } else if (name === "error") {
            throw new Error(payload.detail || "The assistant could not complete a reply.");
          }
        }
      }
      if (!reply.trim()) throw new Error("The assistant returned an empty reply. Please retry.");
    } catch (cause) {
      const stopped = controller.signal.aborted;
      if (reply.trim()) {
        setMessages([...history, { role: "assistant", content: reply + (stopped ? " …" : "") }]);
        if (!stopped) setError(failureMessage(cause, "The reply was cut off."));
      } else {
        setMessages(history.slice(0, -1));
        setDraft(content);
        if (!stopped) setError(failureMessage(cause, "Could not reach the advisor. Please retry."));
      }
    } finally {
      abort.current = null;
      busy.current = false;
      setPending(false);
    }
  }, []);

  // Restore this tab's conversation; /advisor?q=... (a link from another page) asks that question at once.
  // (After the first paint: the server render has no sessionStorage, so the first client render matches it.)
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const saved = loadChat();
      setMessages(saved);
      setHidden(readPrivacy());
      loaded.current = true;
      const q = new URLSearchParams(window.location.search).get("q");
      if (q) {
        window.history.replaceState(null, "", "/advisor");
        void send(q.slice(0, 4000), saved);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [send]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft, messages);
  }

  function newChat() {
    abort.current?.abort();
    setMessages([]);
    setSuggestions([]);
    setError("");
    saveChat([]);
  }

  const asked = new Set(messages.filter((m) => m.role === "user").map((m) => m.content));
  const chips = (messages.length === 0 ? starterQuestions(session) : suggestions).filter((q) => !asked.has(q));

  return (
    <main className="flex h-screen overflow-hidden bg-white">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b-2 border-zinc-900 py-4 pl-4 pr-20 md:px-12">
          <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">Advisor · Conversation</h1>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <GroundingBadges session={session} grounding={grounding} />
            <button
              type="button"
              onClick={() => setTradeOpen((open) => !open)}
              aria-pressed={tradeOpen}
              className="eq-tap cursor-pointer text-xs font-semibold uppercase tracking-widest text-zinc-900 transition-colors hover:text-zinc-500"
            >
              {tradeOpen ? "Back to the chat" : "Check a trade"}
            </button>
            {messages.length > 0 && (
              <button
                onClick={newChat}
                className="eq-tap cursor-pointer text-xs font-semibold uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-900"
              >
                New chat
              </button>
            )}
          </div>
        </div>

        {grounding?.notices.map((notice) => (
          <p key={notice} className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 md:px-12">
            {notice}
          </p>
        ))}

        <div className="flex flex-1 overflow-hidden">
          <section
            aria-label="Conversation"
            aria-live="polite"
            aria-busy={pending}
            className="flex flex-1 flex-col overflow-y-auto px-4 py-6 md:px-12 md:py-10"
          >
            {tradeOpen ? (
              <div className="max-w-3xl">
                <p className="font-heading text-4xl leading-tight text-zinc-900">Check a planned trade.</p>
                <p className="mb-6 mt-2 text-xs leading-relaxed text-zinc-500">
                  The verdict comes from EgoQuant&apos;s deterministic check against your limits; the advisor can only explain it.
                  Enter the trade in the form, never as free text.
                </p>
                <div className="flex min-h-[28rem] flex-col">
                  <TradeCheck
                    session={session ?? {}}
                    result={session?.result}
                    onExplain={(context, summary) => {
                      setTradeOpen(false);
                      void send(summary, messages, context);
                    }}
                  />
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex max-w-xl flex-1 flex-col justify-center">
                <p className="font-heading text-5xl leading-[1.1] text-zinc-900">
                  Ask your
                  <br />
                  advisor.
                </p>
                <div className="mt-6 h-px bg-zinc-300" />
                <Greeting text={greeting} className="mt-6" />
                <p className="mt-5 text-base leading-relaxed text-zinc-600">
                  {session?.result
                    ? "The advisor has read your risk profile, your approved portfolio, the Risk Engine's checks and this week's briefing. Ask why anything is the way it is."
                    : session?.profile
                      ? "The advisor has read your risk profile. Build your portfolio and it can explain that too."
                      : "Ask how EgoQuant works or about any investing idea. Complete your profile and the advisor can explain your own results."}
                </p>
                <p className="mt-3 text-xs leading-relaxed text-zinc-400">
                  Numbers come only from EgoQuant&apos;s engine; the advisor explains them. It gives no trade
                  signals or forecasts, and a compliance filter checks every reply.
                </p>
                <Chips items={chips} onPick={(q) => void send(q, messages)} disabled={pending} vertical />
              </div>
            ) : (
              <div className="flex max-w-3xl flex-col gap-8">
                <Greeting text={greeting} />
                {messages.map((message, index) =>
                  message.role === "user" ? (
                    <div key={index}>
                      <Speaker you picture={myPicture}>You</Speaker>
                      <div className="border-l-2 border-zinc-300 pl-5">
                        <p className="whitespace-pre-wrap break-words text-[15px] italic leading-relaxed text-zinc-700">
                          {message.content}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div key={index}>
                      <Speaker>
                        EgoQuant
                        {message.filtered && <span className="ml-2 normal-case tracking-normal text-amber-700">· compliance filter applied</span>}
                      </Speaker>
                      <div className="break-words border-l-4 border-zinc-900 pl-5 text-[15px] leading-[1.75] text-zinc-800">
                        {message.content ? (
                          <Markdown text={message.content} />
                        ) : (
                          <Loader size="sm" label="Reading your results" />
                        )}
                        {(message.what_if ?? []).map((r, i) => <WhatIfCard key={i} result={r} />)}
                        {(message.trade_checks ?? []).map((t, i) => <TradeCheckCard key={i} item={t} currency={currency} />)}
                      </div>
                    </div>
                  )
                )}
                {!pending && chips.length > 0 && (
                  <Chips items={chips} onPick={(q) => void send(q, messages)} disabled={pending} />
                )}
              </div>
            )}
            <div ref={end} />
          </section>

          <ContextPanel session={session} />
        </div>

        {error && (
          <p role="alert" className="border-t border-zinc-200 px-4 py-2 text-xs text-red-600 md:px-12">
            {error}
          </p>
        )}

        <div className="border-t border-zinc-200 px-4 pt-2 md:px-12"><PrivacyNote hidden={hidden} /></div>
        <form onSubmit={submit} className="flex items-end gap-4 border-t-2 border-zinc-900 bg-zinc-50 px-4 py-4 md:gap-8 md:px-12 md:py-6">
          <label htmlFor="message" className="sr-only">Your message</label>
          <textarea
            id="message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!pending && draft.trim()) e.currentTarget.form?.requestSubmit();
              }
            }}
            maxLength={4000}
            rows={2}
            placeholder={session?.result ? "Ask about your portfolio, your limits or this week's news…" : "Type your message…"}
            className="flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400"
          />
          {pending ? (
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="shrink-0 cursor-pointer pb-0.5 text-sm font-semibold uppercase tracking-widest text-zinc-500 transition-colors hover:text-zinc-900"
            >
              Stop ■
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim()}
              className="eq-tap shrink-0 cursor-pointer pb-0.5 text-sm font-semibold uppercase tracking-widest text-zinc-900 transition-colors hover:text-zinc-500 disabled:cursor-default disabled:text-zinc-300"
            >
              Send →
            </button>
          )}
        </form>
      </div>
    </main>
  );
}

/** The assistant's first line (not part of the conversation that goes to the chat). */
/** Who is speaking: a small picture, then the name. The person's own picture beside their messages, the Advisor's face
 *  beside its replies (Bideci, 20 Oct: "a personality"). */
function Speaker({ you = false, picture = null, children }: { you?: boolean; picture?: string | null; children: ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2.5">
      {you ? <Avatar value={picture} size={26} label="Your picture" /> : <AdvisorAvatar size={26} />}
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{children}</p>
    </div>
  );
}

function Greeting({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={className}>
      <Speaker>EgoQuant</Speaker>
      <p className="break-words border-l-4 border-zinc-900 pl-5 text-[15px] leading-[1.75] text-zinc-800">{text}</p>
    </div>
  );
}

function Chips({ items, onPick, disabled, vertical }: {
  items: string[]; onPick: (q: string) => void; disabled: boolean; vertical?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className={vertical ? "mt-8 flex flex-col gap-3" : "flex flex-wrap gap-2"}>
      {items.map((q) => (
        <button
          key={q}
          disabled={disabled}
          onClick={() => onPick(q)}
          className={
            vertical
              ? "cursor-pointer border-l-2 border-zinc-200 py-1 pl-4 text-left text-sm text-zinc-500 transition-colors hover:border-zinc-900 hover:text-zinc-900"
              : "cursor-pointer border border-zinc-300 px-3 py-1.5 text-left text-xs text-zinc-600 transition-colors hover:border-zinc-900 hover:text-zinc-900"
          }
        >
          {q}
        </button>
      ))}
    </div>
  );
}

function GroundingBadges({ session, grounding }: { session: Session | null; grounding: Grounding | null }) {
  const profile = grounding?.profile ?? !!session?.answers;
  const portfolio = grounding?.portfolio ?? !!session?.result?.chat_context;
  const item = (on: boolean, text: string) => (
    <span className={`text-xs font-medium uppercase tracking-widest ${on ? "text-zinc-900" : "text-zinc-400"}`}>
      {on ? "●" : "○"} {text}
    </span>
  );
  return (
    <div className="hidden items-center gap-4 md:flex" title="What the advisor can read">
      {item(profile, "Profile")}
      {item(portfolio, "Portfolio")}
    </div>
  );
}

/** Which part of the profile set the category, in the words a person uses (the API says tolerance / capacity / gate / game). */
const BINDING: Record<string, string> = {
  tolerance: "attitude to risk", capacity: "finances", gate: "no-loss answer", game: "Risk Game",
};

/** What the advisor can see, so the investor knows where its answers come from. */
function ContextPanel({ session }: { session: Session | null }) {
  const profile = session?.profile;
  const result = session?.result;
  const report = result?.report;
  const top = report ? [...report.allocation].sort((a, b) => b.weight - a.weight).slice(0, 5) : [];
  const heading = "mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400";
  return (
    <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-zinc-200 bg-zinc-50/60 px-8 py-10 xl:block">
      <p className={heading}>What the advisor sees</p>

      <div className="border-l-2 border-zinc-900 pl-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Risk profile</p>
        {profile ? (
          <>
            <p className="mt-1 font-heading text-3xl text-zinc-900">{profile.c_level}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">
              Set by your {BINDING[profile.binding_dimension] ?? "answers"}. Up to{" "}
              {pct(profile.suitability_max_equity)} in stocks, product risk level up to R{profile.max_r_level}.
            </p>
          </>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">
            Not yet. <Link href="/questionnaire" className="underline">Take the questionnaire</Link>.
          </p>
        )}
      </div>

      <div className="mt-8 border-l-2 border-zinc-900 pl-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Portfolio</p>
        {result && report ? (
          <>
            <p className={`mt-1 text-sm font-semibold ${result.approved ? "text-zinc-900" : "text-red-700"}`}>
              {result.approved ? "Approved by the Risk Engine" : "Not approved by the Risk Engine"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {priceLine(result)}
            </p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {top.map((row) => (
                <li key={row.asset_id} className="flex justify-between gap-3 text-xs">
                  <span className="truncate text-zinc-700" title={row.name}>{row.asset_id} <span className="text-zinc-400">{label(row.asset_class)}</span></span>
                  <span className="tabular-nums text-zinc-900">{pct(row.weight, 1)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-zinc-600">
              Worst hypothetical loss {pct(report.worst_loss, 1)}
              {result.goal ? ` · goal reached in ${pct(result.goal.chosen.prob_goal)} of simulated paths` : ""}
            </p>
            {!result.chat_context && (
              <p className="mt-2 text-xs text-amber-700">
                Built before the advisor could read it. <Link href="/portfolio" className="underline">Rebuild</Link> to discuss it.
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">
            Not yet. <Link href={profile ? "/interests" : "/questionnaire"} className="underline">Build your portfolio</Link>.
          </p>
        )}
      </div>

      {report?.market_briefing && (
        <div className="mt-8 border-l-2 border-zinc-900 pl-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Market briefing</p>
          <p className="mt-1 text-xs text-zinc-600">
            {report.market_briefing.items.length} news items, {shortDay(report.market_briefing.period_start)} to{" "}
            {shortDay(report.market_briefing.period_end)}. Shown alongside; never changes the portfolio.
          </p>
        </div>
      )}

      <p className="mt-10 text-[11px] leading-relaxed text-zinc-400">
        Your questionnaire answers are re-scored on the server for every message; the portfolio is accepted
        only with the engine&apos;s seal. Nothing you type is stored by the AI provider.
      </p>
    </aside>
  );
}
