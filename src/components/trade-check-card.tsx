"use client";

import Link from "next/link";
import { VerdictView } from "@/components/trade-check";
import { money } from "@/components/report-view";
import type { ChatTradeCheck } from "@/lib/trade-check";

// A trade check under the advisor's reply (the chat found a trade in the question and the engine checked it against the
// investor's limits and saved trading history): the same verdict, reasons and before/after numbers as the Trade check page,
// as a small card. The verdict is the engine's, never the chat's. When the check could not be run, the card says why in
// plain words and where to go: the Account page (sign in, agreement, trading history) or the Trade check page.

const NOT_RUN: Record<Exclude<ChatTradeCheck["status"], "ok">, { text: string; href: string; link: string }> = {
  needs_account: {
    text: "To check a trade against your own trading history you need to be signed in.",
    href: "/account", link: "Sign in on the Account page",
  },
  needs_consent: {
    text: "Please agree to the trade-check terms in your account first.",
    href: "/account#agreements", link: "Agree in your account",
  },
  no_history: {
    text: "There is no trading history in your account yet, so the check does not know what you hold.",
    href: "/account#data", link: "Add your IBKR data in your account",
  },
  invalid: {
    text: "That trade could not be turned into a check.",
    href: "/portfolio", link: "Enter it on the Trade check page",
  },
  unavailable: {
    text: "The check could not be run just now.",
    href: "/portfolio", link: "Try it on the Trade check page",
  },
};

export function TradeCheckCard({ item, currency }: { item: ChatTradeCheck; currency: string }) {
  const planned = item.planned;
  const share = typeof item.resolved_from_percent === "number" ? Number(item.resolved_from_percent.toFixed(1)) : null;
  const wording = item.status === "ok" ? null : NOT_RUN[item.status];
  return (
    <div className="mt-3 border-2 border-zinc-900 bg-white px-4 py-3 text-sm text-zinc-800" aria-label="Trade check">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Trade check</p>
      {planned && share !== null && (
        <p className="mb-2 text-xs text-zinc-500">
          {planned.side === "sell" ? "Selling" : "Buying"} {share}% of your {planned.ticker} is about {money(planned.amount, currency)}.
        </p>
      )}
      {item.status === "ok" && item.check ? (
        <VerdictView check={item.check} currency={currency} compact words={item.verdict_words} />
      ) : (
        <>
          <p className="text-xs font-semibold text-zinc-900">Not run</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600">
            {item.reason?.trim() || wording?.text}
          </p>
          {wording && (
            <Link href={wording.href} className="mt-2 inline-block text-xs font-semibold uppercase tracking-widest text-zinc-900 underline">
              {wording.link}
            </Link>
          )}
        </>
      )}
    </div>
  );
}
