"use client";

import { useEffect, useState } from "react";
import { type Answers, type PreferenceAnswers, answersWithGame, callApi, useSession } from "@/lib/egoquant";
import { type AreaPlan, areaCount, areaName, overNote, parseAreaPlan, splitAreas } from "@/lib/interest-areas";

// "Areas used for prices and news: 5 of 8", with the areas numbered in the order the build uses them. Shown before a
// portfolio is built so the limit is never a surprise. Hidden when there is nothing chosen yet or the backend cannot say.

export function InterestAreas({ answers, platforms, preferences, names, className = "border-t border-zinc-200 pt-3" }: {
  answers: Answers;
  platforms: string[];
  preferences: PreferenceAnswers | null;
  names?: Record<string, string>;      // area id -> the wording of the questions ("us_stocks" -> "U.S. stocks")
  className?: string;
}) {
  const [plan, setPlan] = useState<AreaPlan | null>(null);
  const game = useSession()?.riskGame;                  // the category the areas are worked out for includes the game
  const key = preferences ? JSON.stringify([preferences, platforms]) : "";

  useEffect(() => {
    if (!preferences || !Object.keys(preferences.choices).length) return;
    let alive = true;
    const timer = setTimeout(() => {
      callApi<unknown>("/api/preferences/areas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: answersWithGame(answers, game), trading_platforms: platforms, preferences }),
        timeoutMs: 20_000,
      })
        .then((raw) => { if (alive) setPlan(parseAreaPlan(raw)); })
        .catch(() => { if (alive) setPlan(null); });       // no route, no answer: show nothing rather than a guess
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
    // `key` stands for preferences and platforms
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, answers, game]);

  if (!preferences || !Object.keys(preferences.choices).length || !plan || !plan.areas.length) return null;
  const count = areaCount(plan);
  const { used, skipped } = splitAreas(plan);
  const note = overNote(plan, names);
  return (
    <div className={`shrink-0 ${className}`}>
      <p aria-live="polite" className="text-xs text-zinc-600">
        <span className="font-semibold text-zinc-900">{count.used} of {count.limit} areas</span> used for prices and news
        {count.over && ` (${count.chosen} chosen)`}
      </p>
      <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {used.map((area, i) => (
          <li key={area} className="text-zinc-900">
            <span className="mr-1 tabular-nums text-zinc-400">{i + 1}</span>{areaName(area, names)}
          </li>
        ))}
        {skipped.map((area, i) => (
          <li key={area} className="text-zinc-400">
            <span className="mr-1 tabular-nums">{used.length + i + 1}</span>{areaName(area, names)}
            <span className="sr-only"> (left out)</span>
          </li>
        ))}
      </ol>
      {note && <p role="status" className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-600">{note}</p>}
    </div>
  );
}
