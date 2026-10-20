import Link from "next/link";
import type { ReactNode } from "react";

// The small markdown subset the advisor writes: paragraphs, "-" and "1." lists, **bold**, *italic* / _italic_,
// `code` and [links](...). No raw HTML. Links go only to our own pages ("/...") or to http(s) addresses.

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function inline(text: string, key: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const k = `${key}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={k} className="font-semibold text-zinc-900">{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={k} className="bg-zinc-100 px-1 text-[13px]">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const [, label, href] = link;
      if (href.startsWith("/") && !href.startsWith("//"))
        return <Link key={k} href={href} className="underline decoration-zinc-400 underline-offset-2 hover:decoration-zinc-900">{label}</Link>;
      if (/^https?:\/\//.test(href))
        return <a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-zinc-400 underline-offset-2 hover:decoration-zinc-900">{label}</a>;
      return label;
    }
    if (part.length > 2 && ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))))
      return <em key={k}>{part.slice(1, -1)}</em>;
    return part;
  });
}

type Block = { kind: "p" | "ul" | "ol" | "h"; lines: string[] };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      out.push({ kind: "p", lines: [] });   // paragraph break
      continue;
    }
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const kind = bullet ? "ul" : numbered ? "ol" : heading ? "h" : "p";
    const content = (bullet ?? numbered ?? heading)?.[1] ?? line;
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind !== "h" && last.lines.length > 0) last.lines.push(content);
    else out.push({ kind, lines: [content] });
  }
  return out.filter((b) => b.lines.length > 0);
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks(text).map((block, i) => {
        const key = `b${i}`;
        if (block.kind === "ul" || block.kind === "ol") {
          const List = block.kind === "ul" ? "ul" : "ol";
          return (
            <List key={key} className={`${block.kind === "ul" ? "list-disc" : "list-decimal"} flex flex-col gap-1 pl-5 marker:text-zinc-400`}>
              {block.lines.map((line, j) => <li key={j}>{inline(line, `${key}-${j}`)}</li>)}
            </List>
          );
        }
        if (block.kind === "h")
          return <p key={key} className="font-semibold text-zinc-900">{inline(block.lines[0], key)}</p>;
        return (
          <p key={key}>
            {block.lines.flatMap((line, j) => (j === 0 ? inline(line, `${key}-${j}`) : [<br key={`br${j}`} />, ...inline(line, `${key}-${j}`)]))}
          </p>
        );
      })}
    </div>
  );
}
