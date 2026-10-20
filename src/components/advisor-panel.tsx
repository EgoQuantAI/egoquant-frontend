"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { AdvisorAvatar, Avatar } from "@/components/avatar";
import { Markdown } from "@/components/markdown";
import { TradeCheckCard } from "@/components/trade-check-card";
import { Loader } from "@/components/ui/loader";
import { PrivacyNote, WhatIfCard } from "@/components/what-if-card";
import type { PortfolioResult, Session } from "@/lib/egoquant";
import { failureMessage, genericFailure, statusMessage } from "@/lib/http-errors";
import { advisorGreeting } from "@/lib/greeting";
import { firstName, useProfile } from "@/lib/profile";
import { reportView, useReportView } from "@/lib/report-view";
import { type ChatTradeCheck, tradeChecksList } from "@/lib/trade-check";
import { type WhatIfResult, addPrivacy, chatSessionId, readPrivacy, whatIfList } from "@/lib/what-if";

// A small advisor beside the portfolio result: the first taste of the chat. It speaks the same protocol
// as the full advisor (src/app/advisor/page.tsx: POST /api/chat/stream, server-sent meta / delta / done /
// error, plain /api/chat when the stream is not deployed) and keeps the conversation in the same
// sessionStorage key, so "Continue in the Advisor" picks it up where it stopped. It shows only the latest
// exchange, so it never scrolls; a long answer fades out and links to the full chat.

type Message = { role: "user" | "assistant"; content: string; what_if?: WhatIfResult[]; trade_checks?: ChatTradeCheck[] };

const CHAT_KEY = "egoquant.advisor.chat.v1";   // shared with the advisor page
const MAX_MESSAGES = 30;
const MAX_CHARS = 28_000;

function loadChat(key: string): Message[] {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(key) || "[]");
    return Array.isArray(saved) ? saved.filter((m) => m && typeof m.content === "string") : [];
  } catch {
    return [];
  }
}

function saveChat(key: string, messages: Message[]) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(messages.filter((m) => m.content).slice(-60)));
  } catch {
    // storage blocked: the panel still works for this page view
  }
}

function recent(history: Message[]): Message[] {
  const out: Message[] = [];
  let chars = 0;
  for (let i = history.length - 1; i >= 0 && out.length < MAX_MESSAGES; i--) {
    chars += history[i].content.length;
    if (chars > MAX_CHARS && out.length > 0) break;
    out.unshift({ role: history[i].role, content: history[i].content.slice(0, 4000) });
  }
  return out;
}

function starters(result: PortfolioResult): string[] {
  const top = [...result.report.allocation].sort((a, b) => b.weight - a.weight)[0];
  return [
    ...(result.approved ? [] : ["Why did the Risk Engine not approve my portfolio?"]),
    ...(top ? [`Why is ${top.asset_id} my largest holding?`] : []),
    ...(result.goal ? ["How likely am I to reach my goal, and what drives that?"] : []),
    "What happens to my portfolio in the worst stress scenario?",
  ].slice(0, 3);
}

/** `chatKey`: where this conversation is kept (a saved report keeps its own, apart from the live build's).
 *  `fullChat`: the conversation continues on /advisor (the live build only); otherwise a long answer scrolls here. */
export function AdvisorPanel({ session, result, chatKey = CHAT_KEY, fullChat = true }: {
  session: Session; result: PortfolioResult; chatKey?: string; fullChat?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [clipped, setClipped] = useState(false);
  const [hidden, setHidden] = useState(0);
  const [phoneOpen, setPhoneOpen] = useState(false);   // phone width: the panel sits under the report, folded
  const view = useReportView();                          // the report tab on screen: the chat knows what is being looked at
  const profile = useProfile();
  const greeting = advisorGreeting(firstName(profile));   // shown by this page only; never part of what is sent to the chat
  const myPicture = profile.state === "in" ? profile.avatar : null;   // beside the person's own question
  // A saved report whose build kept no what-if facts is the older kind that cannot simulate: its chat shows no trade card.
  const tradeCards = fullChat || !!result.what_if_context;
  const currency = result.report.currency ?? "USD";
  const answerBox = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  // This tab's conversation, after the first paint (the server render has no sessionStorage).
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setMessages(loadChat(chatKey));
      setHidden(readPrivacy());
    });
    return () => cancelAnimationFrame(frame);
  }, [chatKey]);

  // Fade the answer out when it is taller than the panel.
  useEffect(() => {
    const box = answerBox.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setClipped(box.scrollHeight > box.clientHeight + 2));
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => observer.disconnect();
  }, [messages.length]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    const history: Message[] = [...loadChat(chatKey), { role: "user", content }];
    setPending(true);
    setError("");
    setSuggestions([]);
    setDraft("");
    setMessages([...history, { role: "assistant", content: "" }]);
    const controller = new AbortController();
    abort.current = controller;
    let reply = "";
    let whatIf: WhatIfResult[] = [];
    let trades: ChatTradeCheck[] = [];
    const extras = () => ({ ...(whatIf.length ? { what_if: whatIf } : {}), ...(trades.length ? { trade_checks: trades } : {}) });
    const show = () => setMessages([...history, { role: "assistant", content: reply, ...extras() }]);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: recent(history),
          answers: session.answers ?? null,
          portfolio_context: result.chat_context ?? null,
          what_if_context: result.what_if_context ?? null,
          session_id: chatSessionId(),
          page: "portfolio",
          view: reportView()?.id,   // the report tab on screen (left out when none)
        }),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
      });
      if (response.status === 404) {
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
      } else {
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
            if (name === "meta") setSuggestions(payload.suggestions ?? []);
            else if (name === "delta") { reply += payload.text; show(); }
            else if (name === "done") {
              reply = payload.reply;
              whatIf = whatIfList(payload.what_if);
              trades = tradeChecksList(payload.trade_checks);
              setHidden(addPrivacy(payload.privacy));
              show();
              finished = true;
            }
            else if (name === "error") throw new Error(payload.detail || "The assistant could not complete a reply.");
          }
        }
      }
      if (!reply.trim()) throw new Error("The assistant returned an empty reply. Please retry.");
      saveChat(chatKey, [...history, { role: "assistant", content: reply, ...extras() }]);
    } catch (cause) {
      if (reply.trim()) {
        saveChat(chatKey, [...history, { role: "assistant", content: reply }]);
        if (!controller.signal.aborted) setError(failureMessage(cause, "The reply was cut off."));
      } else {
        setMessages(history.slice(0, -1));
        setDraft(content);
        if (!controller.signal.aborted) setError(failureMessage(cause, "Could not reach the advisor. Please retry."));
      }
    } finally {
      abort.current = null;
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastAnswer = messages[messages.length - 1]?.role === "assistant" ? messages[messages.length - 1] : null;
  const asked = new Set(messages.filter((m) => m.role === "user").map((m) => m.content));
  const chips = (lastUser ? suggestions : starters(result)).filter((q) => !asked.has(q)).slice(0, 3);

  return (
    <aside aria-label="Ask the Advisor" className="flex min-h-0 flex-col border-t-2 border-zinc-900 bg-zinc-50 md:border-l-2 md:border-t-0">
      <div className="shrink-0 px-4 pt-6 md:px-7 md:pt-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AdvisorAvatar size={44} />
            <p className="font-heading text-3xl leading-none text-zinc-900">Ask the Advisor</p>
          </div>
          <button type="button" onClick={() => setPhoneOpen((o) => !o)} aria-expanded={phoneOpen} aria-controls="advisor-panel-body"
                  className="shrink-0 text-xs font-semibold uppercase tracking-widest text-zinc-900 md:hidden">
            {phoneOpen ? "Close" : "Open"}
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          It has read this portfolio and your profile. It explains; it never gives trade tips.
        </p>
        <div className="mt-2"><PrivacyNote hidden={hidden} /></div>
        <div className="eq-rule mt-5 h-px bg-zinc-300" />
      </div>

      <div id="advisor-panel-body" className={`${phoneOpen ? "flex" : "hidden"} min-h-[260px] flex-1 flex-col px-4 py-5 md:flex md:min-h-0 md:px-7`}
           aria-live="polite" aria-busy={pending}>
        {lastUser ? (
          <>
            <div className="mb-3 flex shrink-0 items-start gap-2.5">
              <Avatar value={myPicture} size={24} label="Your picture" />
              <p className="min-w-0 flex-1 border-l-2 border-zinc-300 pl-4 text-sm italic leading-relaxed text-zinc-600">
                {lastUser.content}
              </p>
            </div>
            <div className="mb-2 flex shrink-0 items-center gap-2.5">
              <AdvisorAvatar size={24} />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">EgoQuant</p>
            </div>
            <div ref={answerBox}
                 className={`relative min-h-0 flex-1 ${fullChat ? "overflow-hidden" : "eq-scroll overflow-y-auto pr-2"} border-l-4 border-zinc-900 pl-4 text-sm leading-[1.7] text-zinc-800 ${clipped && fullChat ? "eq-clip" : ""}`}>
              <div>
                {lastAnswer?.content
                  ? <Markdown text={lastAnswer.content} />
                  : <Loader size="sm" label="Reading your results" />}
                {(lastAnswer?.what_if ?? []).map((r, i) => <WhatIfCard key={i} result={r} />)}
                {tradeCards && (lastAnswer?.trade_checks ?? []).map((t, i) => <TradeCheckCard key={i} item={t} currency={currency} />)}
              </div>
            </div>
            {!pending && fullChat && (
              <Link href="/advisor" className="mt-3 shrink-0 text-xs font-semibold uppercase tracking-widest text-zinc-900 hover:text-zinc-500">
                {clipped ? "Read the full answer" : "Continue in the Advisor"} <span className="eq-arrow">→</span>
              </Link>
            )}
          </>
        ) : (
          <>
            <p className="border-l-4 border-zinc-900 pl-4 text-sm leading-relaxed text-zinc-800">{greeting}</p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-600">
              Not sure why a number is what it is? Ask in your own words, or start with one of these.
            </p>
          </>
        )}

        {!pending && chips.length > 0 && (
          <div className={`flex shrink-0 flex-col gap-2 ${lastUser ? "mt-4" : "mt-5"}`}>
            {chips.map((q) => (
              <button key={q} type="button" onClick={() => void send(q)}
                      className="border-l-2 border-zinc-200 py-1 pl-3 text-left text-xs leading-snug text-zinc-600 transition-colors hover:border-zinc-900 hover:text-zinc-900">
                {q}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p role="alert" className="shrink-0 px-4 pb-2 text-xs text-red-600 md:px-7">{error}</p>}

      <form onSubmit={submit} className={`${phoneOpen ? "flex" : "hidden"} shrink-0 items-end gap-4 border-t-2 border-zinc-900 bg-white px-4 py-4 md:flex md:px-7`}>
        <label htmlFor="panel-message" className="sr-only">Your question</label>
        <textarea
          id="panel-message"
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
          placeholder={view ? `Ask about the ${view.title} tab, or anything…` : "Ask about this portfolio…"}
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed text-zinc-900 outline-none placeholder:text-zinc-400"
        />
        {pending ? (
          <button type="button" onClick={() => abort.current?.abort()}
                  className="shrink-0 pb-0.5 text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()}
                  className="shrink-0 pb-0.5 text-xs font-semibold uppercase tracking-widest text-zinc-900 hover:text-zinc-500 disabled:text-zinc-300">
            Ask <span className="eq-arrow">→</span>
          </button>
        )}
      </form>
    </aside>
  );
}
