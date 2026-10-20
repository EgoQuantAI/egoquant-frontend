"use client";

import { type FormEvent, useEffect, useState } from "react";
import { callApi, type PortfolioOptions, type PortfolioResult } from "@/lib/egoquant";

const C_LEVELS = ["C1", "C2", "C3", "C4", "C5", "C5b"] as const;
type CLevel = (typeof C_LEVELS)[number];

const C_NAMES: Record<CLevel, string> = {
  C1: "Conservative",
  C2: "Cautious",
  C3: "Balanced",
  C4: "Active",
  C5: "Aggressive · Experienced",
  C5b: "Aggressive · Beginner (crypto blocked)",
};

type DebugReport = {
  equity_weight?: number;
  ex_ante_vol?: number;
  worst_loss?: number;
  headline?: string;
  banners?: string[];
} & Record<string, unknown>;

function pct(x: unknown, digits = 0) {
  return typeof x === "number" ? `${(x * 100).toFixed(digits)}%` : "–";
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function DebugModels() {
  const [options, setOptions] = useState<PortfolioOptions | null>(null);
  const [cLevel, setCLevel] = useState<CLevel>("C3");
  const [interests, setInterests] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [horizon, setHorizon] = useState("10");
  const [liquidity, setLiquidity] = useState("0");
  const [cashBuffer, setCashBuffer] = useState("0");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PortfolioResult | null>(null);

  useEffect(() => {
    callApi<PortfolioOptions>("/api/portfolio/options", { method: "GET", timeoutMs: 20_000 })
      .then(setOptions)
      .catch(() => {}); // non-blocking; interest area pills just won't show
  }, []);

  async function run(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setResult(null);
    try {
      const data = await callApi<PortfolioResult>("/api/debugmodels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          c_level: cLevel,
          interest_areas: interests.length > 0 ? interests : null, // null = persona default
          trading_platforms: platforms,
          horizon_years: Number(horizon) || 10,
          liquidity_need: (Number(liquidity) || 0) / 100,
          min_cash_buffer: (Number(cashBuffer) || 0) / 100,
        }),
        timeoutMs: 125_000,
      });
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Pipeline error.");
    } finally {
      setPending(false);
    }
  }

  const r = result?.report as DebugReport | undefined;

  return (
    <main className="min-h-screen bg-white">
      <div className="border-b-2 border-zinc-900 px-12 py-4 flex items-center justify-between">
        <h1 id="content" tabIndex={-1} className="font-heading text-lg text-zinc-500 outline-none">Debug · Model Execution</h1>
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
          Synthetic data · No questionnaire
        </span>
      </div>

      <div className="px-12 py-10 max-w-3xl">
        <p className="mb-10 border-l-4 border-zinc-300 pl-4 text-sm leading-relaxed text-zinc-500">
          Runs Agent A → Risk Engine with demo persona answers for the selected C-level and synthetic
          market prices. No real market data or questionnaire required.
        </p>

        <form onSubmit={run} className="space-y-10">
          {/* C-level picker */}
          <div>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Risk Category
            </p>
            <div className="flex gap-2 flex-wrap">
              {C_LEVELS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCLevel(c)}
                  className={`border-2 px-5 py-3 text-sm font-semibold uppercase tracking-widest transition-colors ${
                    cLevel === c
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : c === "C5b"
                      ? "border-dashed border-zinc-300 text-zinc-400 hover:border-zinc-900 hover:text-zinc-900"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-900 hover:text-zinc-900"
                  }`}
                >
                  {c === "C5b" ? "C5·B" : c}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {C_NAMES[cLevel]} · persona answers used for questionnaire
            </p>
          </div>

          {/* Interest areas */}
          {options && (
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                Interest Areas{" "}
                <span className="font-normal normal-case tracking-normal text-zinc-300">
                  — empty = persona default
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {options.interest_areas.map((area) => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => setInterests((list) => toggle(list, area))}
                    className={`border px-4 py-2 text-xs font-medium capitalize transition-colors ${
                      interests.includes(area)
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 text-zinc-500 hover:border-zinc-500"
                    }`}
                  >
                    {area.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Trading platforms */}
          {options && options.trading_platforms.length > 0 && (
            <div>
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                Trading Platforms{" "}
                <span className="font-normal normal-case tracking-normal text-zinc-300">
                  — optional
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {options.trading_platforms.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatforms((list) => toggle(list, p.id))}
                    className={`border px-4 py-2 text-xs font-medium transition-colors ${
                      platforms.includes(p.id)
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-200 text-zinc-500 hover:border-zinc-500"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Numeric inputs */}
          <div className="grid grid-cols-3 gap-8">
            <NumInput label="Horizon" unit="years" value={horizon} onChange={setHorizon} />
            <NumInput label="Liquidity need" unit="%" value={liquidity} onChange={setLiquidity} />
            <NumInput label="Min cash buffer" unit="%" value={cashBuffer} onChange={setCashBuffer} />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex items-center gap-6 border-t border-zinc-200 pt-6">
            <button
              type="submit"
              disabled={pending}
              className="border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:cursor-default disabled:opacity-40"
            >
              {pending ? "Running pipeline…" : "Run Pipeline →"}
            </button>
            {pending && (
              <p className="text-xs text-zinc-400">
                Optimizing with synthetic prices, this takes ~10 s…
              </p>
            )}
          </div>
        </form>

        {/* Result */}
        {result && (
          <section className="mt-14">
            <div className="mb-8 h-px bg-zinc-300" />

            <div className="flex items-baseline gap-4 mb-2">
              <p className="font-heading text-6xl leading-none text-zinc-900">
                {result.approved ? "Approved" : "Rejected"}
              </p>
              <p className="font-heading text-2xl text-zinc-400">{result.c_level}</p>
            </div>
            <p className="mb-8 text-sm text-zinc-500">
              {result.status} · {result.data_source} · as of {result.as_of}
            </p>

            <div className="mb-8 grid grid-cols-3 gap-4">
              {[
                { label: "In Stocks", value: pct(r?.equity_weight), note: "Portfolio share" },
                { label: "Volatility", value: pct(r?.ex_ante_vol, 1), note: "Annual swing" },
                { label: "Worst Case", value: pct(r?.worst_loss), note: "Stress scenario" },
              ].map((card) => (
                <div key={card.label} className="border-2 border-zinc-200 p-5">
                  <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                    {card.label}
                  </p>
                  <p className="font-heading text-4xl leading-none text-zinc-900">{card.value}</p>
                  <p className="mt-1 text-xs text-zinc-400">{card.note}</p>
                </div>
              ))}
            </div>

            {r?.headline && (
              <p className="mb-6 border-l-4 border-zinc-900 pl-5 text-sm leading-relaxed text-zinc-900">
                {r.headline}
              </p>
            )}

            {result.violations.length > 0 && (
              <div className="mb-6">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                  Violations
                </p>
                {result.violations.map((v) => (
                  <p key={v} className="mb-1 border-l-2 border-red-400 pl-3 text-sm text-red-600">
                    {v}
                  </p>
                ))}
              </div>
            )}

            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Full Report
            </p>
            <iframe
              title="Debug portfolio report"
              srcDoc={result.html}
              sandbox=""
              className="h-[70vh] w-full border-2 border-zinc-200 bg-white"
            />
          </section>
        )}
      </div>
    </main>
  );
}

function NumInput({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">{label}</p>
      <div className="flex items-center gap-2 border-b-2 border-zinc-900 pb-1">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-xl font-medium text-zinc-900 outline-none"
        />
        <span className="text-sm font-medium text-zinc-400">{unit}</span>
      </div>
    </div>
  );
}
