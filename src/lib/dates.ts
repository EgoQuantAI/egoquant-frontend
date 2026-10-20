/** "2026-10-16" -> "16 Oct" (the day as written, in UTC, so it never shifts with the reader's time zone); "" if it is not a date. */
export function shortDay(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
