"use client";

import { type KeyboardEvent, type PointerEvent, type ReactNode, type WheelEvent, useEffect, useRef, useState } from "react";

// A deck of slides that never scrolls: one slide fills the space, the next slides in from the side.
// Section chips jump to a section's first slide; arrows, the keyboard (← →), a swipe or a sideways trackpad
// gesture move one slide. Slides off screen are inert, so focus and screen readers stay on the visible one.

export type Slide = { key: string; section: string; label: string; node: ReactNode };
export type Section = { id: string; label: string };

const SWIPE_PX = 48;      // a touch drag at least this far changes the slide
const WHEEL_PX = 40;      // a sideways trackpad gesture at least this far changes the slide
const WHEEL_REST = 450;   // ms before the next sideways gesture counts (one gesture, one slide)

export function Deck({ slides, sections, label, resetKey }: {
  slides: Slide[]; sections: Section[]; label: string; resetKey?: string;
}) {
  const [index, setIndex] = useState(0);
  const [lastReset, setLastReset] = useState(resetKey);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const wheelAt = useRef(0);
  const count = slides.length;

  // A new briefing (week ↔ month, a refresh): back to the first slide.
  if (resetKey !== lastReset) {
    setLastReset(resetKey);
    setIndex(0);
  }
  const current = Math.min(index, Math.max(0, count - 1));
  const go = (i: number) => setIndex(Math.max(0, Math.min(count - 1, i)));

  useEffect(() => {
    if (index > count - 1) setIndex(Math.max(0, count - 1));   // eslint-disable-line react-hooks/set-state-in-effect
  }, [count, index]);

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === "ArrowRight") { event.preventDefault(); go(current + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); go(current - 1); }
    if (event.key === "Home") { event.preventDefault(); go(0); }
    if (event.key === "End") { event.preventDefault(); go(count - 1); }
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse") drag.current = { x: event.clientX, y: event.clientY };
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    drag.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(event.clientY - start.y)) go(current + (dx < 0 ? 1 : -1));
  }
  function onWheel(event: WheelEvent<HTMLDivElement>) {
    if (Math.abs(event.deltaX) < WHEEL_PX || Math.abs(event.deltaX) < Math.abs(event.deltaY)) return;
    const now = Date.now();
    if (now - wheelAt.current < WHEEL_REST) return;
    wheelAt.current = now;
    go(current + (event.deltaX > 0 ? 1 : -1));
  }

  if (count === 0) return null;
  const active = slides[current];
  const firstOf = (id: string) => slides.findIndex((s) => s.section === id);
  const inSection = slides.filter((s) => s.section === active.section);
  const posInSection = inSection.indexOf(active);

  return (
    <div role="region" aria-roledescription="carousel" aria-label={label} onKeyDown={onKey}
         className="flex min-h-0 flex-1 flex-col outline-none">
      {/* Sections */}
      <div role="tablist" aria-label={`${label}: sections`} className="flex shrink-0 flex-wrap gap-x-5 gap-y-1 border-b-2 border-zinc-100">
        {sections.filter((s) => firstOf(s.id) >= 0).map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={active.section === s.id}
                  onClick={() => go(firstOf(s.id))}
                  className={`eq-tab whitespace-nowrap pb-2 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
                    active.section === s.id ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-700"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Slides */}
      <div className="relative mt-4 min-h-[420px] flex-1 overflow-hidden md:min-h-0"
           onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current = null; }}
           onWheel={onWheel} style={{ touchAction: "pan-y" }}
           onScroll={(e) => { e.currentTarget.scrollLeft = 0; }}>   {/* focus moving into a slide must not shift the track */}
        <div className="eq-deck flex h-full" style={{ transform: `translateX(-${current * 100}%)` }}>
          {slides.map((s, i) => (
            <section key={s.key} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${count}: ${s.label}`}
                     aria-hidden={i !== current} inert={i !== current}
                     className={`eq-slide flex h-full w-full shrink-0 flex-col overflow-hidden ${i === current ? "is-current" : ""}`}>
              {s.node}
            </section>
          ))}
        </div>
      </div>

      {/* Rail: previous · progress · next */}
      <div className="mt-3 flex shrink-0 items-center gap-4">
        <button type="button" onClick={() => go(current - 1)} disabled={current === 0} aria-label="Previous slide"
                className="flex h-9 w-9 items-center justify-center border-2 border-zinc-900 text-sm transition-colors hover:bg-zinc-900 hover:text-white disabled:border-zinc-200 disabled:text-zinc-300 disabled:hover:bg-transparent">
          ←
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3 text-[11px]">
            <span className="truncate font-semibold uppercase tracking-widest text-zinc-900">{active.label}</span>
            <span className="shrink-0 tabular-nums text-zinc-400">
              {inSection.length > 1 && <>{posInSection + 1}/{inSection.length} · </>}
              {String(current + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
            </span>
          </div>
          <div className="mt-1.5 flex gap-[3px]" aria-hidden="true">
            {slides.map((s, i) => (
              <button key={s.key} type="button" tabIndex={-1} onClick={() => go(i)} title={s.label}
                      className={`h-1 flex-1 transition-colors duration-500 ${
                        i === current ? "bg-zinc-900" : s.section === active.section ? "bg-zinc-400" : "bg-zinc-200 hover:bg-zinc-400"}`} />
            ))}
          </div>
        </div>
        <button type="button" onClick={() => go(current + 1)} disabled={current === count - 1} aria-label="Next slide"
                className="flex h-9 w-9 items-center justify-center border-2 border-zinc-900 bg-zinc-900 text-sm text-white transition-colors hover:bg-white hover:text-zinc-900 disabled:border-zinc-200 disabled:bg-transparent disabled:text-zinc-300">
          →
        </button>
      </div>
    </div>
  );
}
