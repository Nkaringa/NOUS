import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Markdown } from "@/components/Markdown";
import { NoteActions } from "@/components/NoteActions";
import type { Note } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notes")
    .select("id, user_id, heading, body_md, definition_md, example_md, domain, sub_category, source, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();
  const note = data as Note;

  return (
    <main className="mx-auto max-w-[720px] px-8 py-10">
      <Link
        href="/notes"
        className="text-[12px] text-ink-mid hover:text-red"
      >
        ← All notes
      </Link>

      <header className="mt-6">
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Link
            href={{ pathname: "/notes", query: { domain: note.domain } }}
            className="rounded bg-bg-soft px-2 py-0.5 text-[11px] text-ink-mid hover:bg-hairline hover:text-ink"
          >
            {note.domain}
          </Link>
          <Link
            href={{
              pathname: "/notes",
              query: { domain: note.domain, sub_category: note.sub_category },
            }}
            className="rounded bg-red-bg px-2 py-0.5 text-[11px] text-red-deep hover:bg-red hover:text-white"
          >
            {note.sub_category}
          </Link>
        </div>

        <h1 className="font-serif text-[30px] font-medium leading-tight tracking-tight text-ink">
          {note.heading}
        </h1>
        <div className="mt-3 border-b border-hairline pb-4 text-[11px] text-ink-soft">
          Ingested {new Date(note.created_at).toLocaleString()} · {note.source}
        </div>
      </header>

      <section className="mt-8">
        <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-mid">
          Definition
        </h2>
        <div className="font-serif text-[17px] leading-relaxed text-ink">
          <Markdown variant="serif">{note.definition_md}</Markdown>
        </div>
      </section>

      {note.example_md && (
        <section className="mt-8">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-mid">
            Example
          </h2>
          <Markdown>{note.example_md}</Markdown>
        </section>
      )}

      {note.body_md && (
        <section className="mt-8">
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-ink-mid">
            Original body
          </h2>
          <Markdown>{note.body_md}</Markdown>
        </section>
      )}

      <section className="mt-10 border-t border-hairline pt-6">
        <NoteActions noteId={note.id} />
      </section>
    </main>
  );
}
