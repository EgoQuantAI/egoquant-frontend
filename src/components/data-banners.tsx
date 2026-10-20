"use client";

import type { ReactNode } from "react";
import type { PortfolioResult } from "@/lib/egoquant";

// Loud notices about the result: demo data first, then the report's own banners (not approved, demo
// news, placeholder limits, ...). The text comes from the backend. Returned as separate blocks so the
// portfolio page can page them instead of scrolling.

export function bannerBlocks(result: PortfolioResult): { key: string; node: ReactNode }[] {
  const blocks: { key: string; node: ReactNode }[] = [];
  if (result.data_source === "synthetic") {
    blocks.push({
      key: "synthetic",
      node: (
        <p role="alert" className="border-l-4 border-red-600 bg-red-50 px-4 py-2.5 text-sm font-semibold leading-relaxed text-zinc-900">
          Demo data: live prices unavailable{result.fallback_reason ? ` (${result.fallback_reason})` : ""}. Numbers
          are illustrative.
        </p>
      ),
    });
  }
  (result.report.banners ?? []).forEach((banner, i) => {
    blocks.push({
      key: `banner${i}`,
      node: (
        <p className="border-l-4 border-zinc-900 bg-zinc-50 px-4 py-2.5 text-sm font-semibold leading-relaxed text-zinc-900">
          {banner}
        </p>
      ),
    });
  });
  return blocks;
}
