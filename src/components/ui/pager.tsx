/** Previous · page n of m · Next: long lists turn pages instead of scrolling. */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  const link = "text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900 disabled:cursor-default disabled:opacity-30";
  return (
    <div className="mt-3 flex items-center gap-4">
      <button type="button" className={link} disabled={page === 0} onClick={() => onPage(page - 1)}>← Newer</button>
      <span className="text-xs text-zinc-400">Page {page + 1} of {pages}</span>
      <button type="button" className={link} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Older →</button>
    </div>
  );
}
