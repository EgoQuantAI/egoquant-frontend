/** A link that opens the advisor chat and asks `question` right away (handled by src/app/advisor/page.tsx). */
export function askHref(question: string): string {
  return `/advisor?q=${encodeURIComponent(question)}`;
}
