import Link from "next/link";
import type { Note } from "@/lib/types";

export function NoteCard({ note }: { note: Note; compact?: boolean }) {
  return (
    <Link
      href={`/notes/${note.id}`}
      className="group block border-b border-hairline py-4 hover:bg-bg-soft hover:-mx-3 hover:px-3 transition-[margin,padding]"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-medium tracking-tight text-ink group-hover:text-ink">
            {note.heading}
          </h3>
          <p className="mt-1.5 line-clamp-2 max-w-[640px] text-[13px] leading-relaxed text-ink-mid">
            {stripMarkdown(note.definition_md)}
          </p>
        </div>
        <div className="shrink-0 text-right text-[11px] text-ink-mid">
          <div>
            {note.domain} <span className="text-ink-soft">·</span>{" "}
            <span className="text-red">{note.sub_category}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 text-[11px] text-ink-soft">
        {new Date(note.created_at).toLocaleDateString()} · {note.source}
      </div>
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
