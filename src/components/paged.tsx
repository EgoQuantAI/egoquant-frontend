"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

// A list that never scrolls: it shows as many items as fit in the space it is given and pages the rest.
// An invisible copy of the whole list (same width and layout) is measured, so items of any height work,
// and in a grid a page always starts at the beginning of a row. Re-measured whenever the space changes.

const PAGER_HEIGHT = 36;   // px kept free for the pager row when there is more than one page

/** Indexes where each page starts, from the measured copy. */
function pageStarts(children: HTMLElement[], room: number): number[] {
  const starts = [0];
  let top = children[0]?.offsetTop ?? 0;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.offsetTop + el.offsetHeight - top > room && i > starts[starts.length - 1]) {
      // Back up to the first item of this row, so a page never starts mid-row.
      let start = i;
      while (start > starts[starts.length - 1] + 1 && children[start - 1].offsetTop === el.offsetTop) start--;
      starts.push(start);
      top = children[start].offsetTop;
    }
  }
  return starts;
}

export function Paged<T>({ items, render, listClassName = "flex flex-col gap-2", itemKey, noun = "items" }: {
  items: T[];
  render: (item: T, index: number) => ReactNode;
  listClassName?: string;
  itemKey: (item: T, index: number) => string;
  noun?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const [starts, setStarts] = useState<number[]>([0]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    const box = outer.current;
    const list = copy.current;
    if (!box || !list) return;
    const measure = () => {
      const kids = Array.from(list.children) as HTMLElement[];
      let next = pageStarts(kids, box.clientHeight);
      if (next.length > 1) next = pageStarts(kids, box.clientHeight - PAGER_HEIGHT);
      setStarts((prev) => (prev.join() === next.join() ? prev : next));
      setPage((p) => Math.min(p, next.length - 1));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    observer.observe(list);
    return () => observer.disconnect();
  }, [items.length]);

  const count = starts.length;
  const current = Math.min(page, count - 1);
  const from = starts[current] ?? 0;
  const to = starts[current + 1] ?? items.length;

  return (
    <div ref={outer} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div aria-hidden inert className="pointer-events-none invisible absolute inset-x-0 top-0">
        <div ref={copy} className={listClassName}>
          {items.map((item, i) => <div key={itemKey(item, i)}>{render(item, i)}</div>)}
        </div>
      </div>

      {/* The page itself may shrink (an item taller than the whole space is cut, not pushed past the pager). */}
      <div className={`min-h-0 overflow-hidden ${count > 1 ? "flex-1" : ""} ${to - from === 1 && count > 1 ? "eq-clip" : ""}`}>
        <div key={current} className={`eq-enter ${listClassName}`}>
          {items.slice(from, to).map((item, i) => <div key={itemKey(item, from + i)}>{render(item, from + i)}</div>)}
        </div>
      </div>

      {count > 1 && (
        <div className="mt-auto flex shrink-0 items-center gap-5 pt-2 text-xs text-zinc-500" style={{ height: PAGER_HEIGHT }}>
          <button type="button" onClick={() => setPage(current - 1)} disabled={current === 0}
                  aria-label={`Previous ${noun}`}
                  className="font-semibold uppercase tracking-widest hover:text-zinc-900 disabled:text-zinc-200">
            ←
          </button>
          <span className="tabular-nums">
            {from + 1}–{to} of {items.length} {noun}
          </span>
          <button type="button" onClick={() => setPage(current + 1)} disabled={current === count - 1}
                  aria-label={`Next ${noun}`}
                  className="font-semibold uppercase tracking-widest hover:text-zinc-900 disabled:text-zinc-200">
            →
          </button>
        </div>
      )}
    </div>
  );
}
