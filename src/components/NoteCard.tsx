import Link from "next/link";
import type { Note } from "@/lib/types";

// Library row: heading leads, serif 2-line preview underneath, key-term
// chips when the note has them (post-migration), mono meta on the right.
// When the list isn't filtered to a sub-category, the taxonomy path shows
// in the meta block so rows stay scannable in "All notes".
export function NoteCard({
  note,
  showPath,
}: {
  note: Note;
  showPath?: boolean;
}) {
  const date = new Date(note.created_at)
    .toLocaleDateString(undefined, { month: "short", day: "numeric" })
    .toUpperCase();

  return (
    <Link
      href={`/notes/${note.id}`}
      className="group block border-b border-hairline px-1 py-5 hover:-mx-4 hover:rounded-xl hover:border-transparent hover:bg-panel hover:px-4"
    >
      <div className="flex items-baseline gap-3">
        <h3 className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-[-.005em] text-ink">
          {note.heading}
        </h3>
        <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-ink-soft">
          {showPath && (
            <>
              {note.domain} · <span className="text-red">{note.sub_category}</span>
              <span className="px-1.5">·</span>
            </>
          )}
          {date} · <i className="not-italic tracking-[.06em]">{note.source.toUpperCase()}</i>
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 max-w-[660px] font-serif text-[14.5px] leading-[1.6] text-ink-mid">
        {stripMarkdown(note.definition_md)}
      </p>
      {note.key_terms && note.key_terms.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {note.key_terms.slice(0, 6).map((t) => (
            <span
              key={t}
              className="rounded-[5px] bg-panel px-2 py-[3px] font-mono text-[10.5px] font-medium text-ink-soft group-hover:bg-panel-deep"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
