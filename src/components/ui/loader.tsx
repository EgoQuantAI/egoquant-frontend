import { cn } from "cn";

// The one waiting mark for the whole site: three ink bars that rise in turn, with what is being waited for.
// Use it for every wait (page, section, button) instead of a plain "Loading…" text, so a visitor never thinks
// the site stalled. <Loader> sits inline; <PageLoader> fills the screen (route gates, first load).

export function Loader({ label = "Loading", className, size = "md" }: { label?: string; className?: string; size?: "sm" | "md" }) {
  const bar = size === "sm" ? "h-3 w-[3px]" : "h-4 w-1";
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-3 text-sm text-zinc-500", className)}>
      <span aria-hidden className="inline-flex items-end gap-[3px]">
        {[0, 1, 2].map(i => (
          <span key={i} className={cn("eq-loader-bar bg-zinc-900", bar)} style={{ animationDelay: `${i * 140}ms` }} />
        ))}
      </span>
      {label && <span>{label}…</span>}
    </span>
  );
}

export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <main className="eq-fade flex h-screen w-full items-center justify-center bg-white">
      <Loader label={label} />
    </main>
  );
}

/** A section's placeholder while its data arrives: grey blocks that shimmer, sized like what will replace them. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("eq-skeleton block bg-zinc-100", className)} />;
}
