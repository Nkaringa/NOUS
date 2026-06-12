// Note detail — 3-zone reading page.
//   Left rail:  taxonomy chips, capture meta, key terms, actions
//   Center:     serif reading column (definition + example + body)
//   Right rail: related notes (vector neighbors) + cited-in chats

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
    .select("id, user_id, workspace_id, heading, body_md, definition_md, example_md, domain, sub_category, source, confidence, key_terms, created_at, updated_at, embedding")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) notFound();
  const note = data as Note & { embedding: string | number[] | null };

  // ── Related notes: this note's own embedding through the existing
  //    vector RPC; nearest neighbors minus self. ──
  let related: Array<{
    id: string;
    heading: string;
    domain: string;
    sub_category: string;
    similarity: number;
  }> = [];
  try {
    const embedding =
      typeof note.embedding === "string"
        ? (JSON.parse(note.embedding) as number[])
        : note.embedding;
    if (Array.isArray(embedding) && embedding.length > 0) {
      const { data: vecRows } = await supabase.rpc("search_notes_vec", {
        p_workspace_id: note.workspace_id,
        p_embedding: embedding,
        p_k: 6,
      });
      const hits = ((vecRows ?? []) as Array<{ id: string; similarity: number }>)
        .filter((r) => r.id !== note.id)
        .slice(0, 4);
      if (hits.length > 0) {
        const { data: relNotes } = await supabase
          .from("notes")
          .select("id, heading, domain, sub_category")
          .in("id", hits.map((h) => h.id));
        const byId = new Map((relNotes ?? []).map((n) => [n.id as string, n]));
        related = hits
          .map((h) => {
            const n = byId.get(h.id);
            return n
              ? {
                  id: n.id as string,
                  heading: n.heading as string,
                  domain: n.domain as string,
                  sub_category: n.sub_category as string,
                  similarity: h.similarity,
                }
              : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);
      }
    }
  } catch {
    // related is best-effort — never block the page
  }

  // ── Cited in chats: messages whose citations contain this note. ──
  let citedIn: Array<{ sessionId: string; title: string; createdAt: string }> = [];
  try {
    const { data: msgs } = await supabase
      .from("chat_messages")
      .select("session_id, created_at, chat_sessions(title)")
      .contains("citations", JSON.stringify([{ id: note.id }]))
      .order("created_at", { ascending: false })
      .limit(10);
    const seen = new Set<string>();
    for (const m of (msgs ?? []) as Array<{
      session_id: string;
      created_at: string;
      chat_sessions: { title: string } | { title: string }[] | null;
    }>) {
      if (seen.has(m.session_id)) continue;
      seen.add(m.session_id);
      const sess = Array.isArray(m.chat_sessions) ? m.chat_sessions[0] : m.chat_sessions;
      if (!sess) continue;
      citedIn.push({
        sessionId: m.session_id,
        title: sess.title,
        createdAt: m.created_at,
      });
    }
    citedIn = citedIn.slice(0, 4);
  } catch {
    // best-effort
  }

  const captured = new Date(note.created_at);

  return (
    <main className="mx-auto grid max-w-[1420px] grid-cols-1 gap-10 px-9 pb-[90px] pt-10 lg:grid-cols-[220px_minmax(0,1fr)_280px] lg:gap-14">
      {/* ── LEFT: meta rail ── */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <Link
          href={{
            pathname: "/notes",
            query: { domain: note.domain, sub_category: note.sub_category },
          }}
          className="text-[12px] text-ink-mid hover:text-red"
        >
          ← {note.sub_category}
        </Link>

        <div className="mt-[22px] flex flex-wrap gap-[5px]">
          <Link
            href={{ pathname: "/notes", query: { domain: note.domain } }}
            className="rounded-md bg-panel px-2.5 py-1 text-[11.5px] font-medium text-ink-mid hover:text-ink"
          >
            {note.domain}
          </Link>
          <Link
            href={{
              pathname: "/notes",
              query: { domain: note.domain, sub_category: note.sub_category },
            }}
            className="rounded-md bg-red-bg px-2.5 py-1 text-[11.5px] font-medium text-red-deep hover:bg-red hover:text-white"
          >
            {note.sub_category}
          </Link>
        </div>

        <div className="mt-6 border-t border-hairline pt-[18px]">
          <MetaKV
            k="Captured"
            v={`${captured
              .toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
              .toUpperCase()} · ${captured.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          />
          <MetaKV k="Source" v={note.source.toUpperCase()} />
          {note.confidence != null && (
            <MetaKV k="Confidence" v={note.confidence.toFixed(2)} />
          )}
        </div>

        {note.key_terms && note.key_terms.length > 0 && (
          <div className="mt-1.5 border-t border-hairline pt-[18px]">
            <div className="mb-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[.12em] text-ink-soft">
              Key terms
            </div>
            <div className="flex flex-wrap gap-[5px]">
              {note.key_terms.map((t) => (
                <span
                  key={t}
                  className="rounded-[5px] bg-panel px-2 py-1 font-mono text-[10.5px] font-medium text-ink-mid"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 border-t border-hairline pt-[18px]">
          <NoteActions noteId={note.id} />
        </div>
      </aside>

      {/* ── CENTER: the reading page ── */}
      <article className="min-w-0 max-w-[720px]">
        <h1 className="font-serif text-[34px] font-semibold leading-[1.15] tracking-[-.01em] text-ink">
          {note.heading}
        </h1>

        <section className="mt-[34px]">
          <h2 className="mb-3 text-[10.5px] font-bold uppercase tracking-[.15em] text-ink">
            Definition
          </h2>
          <div className="font-serif text-[17px] leading-[1.75] text-ink">
            <Markdown variant="serif">{note.definition_md}</Markdown>
          </div>
        </section>

        {note.example_md && (
          <section className="mt-[34px]">
            <h2 className="mb-3 text-[10.5px] font-bold uppercase tracking-[.15em] text-ink">
              Example
            </h2>
            <Markdown>{note.example_md}</Markdown>
          </section>
        )}

        {note.body_md && (
          <section className="mt-[34px]">
            <h2 className="mb-3 text-[10.5px] font-bold uppercase tracking-[.15em] text-ink">
              Original body
            </h2>
            <Markdown>{note.body_md}</Markdown>
          </section>
        )}
      </article>

      {/* ── RIGHT: connections ── */}
      <aside className="lg:sticky lg:top-6 lg:self-start">
        {related.length > 0 && (
          <>
            <div className="mb-3 text-[10.5px] font-bold uppercase tracking-[.14em] text-ink-soft">
              Related notes
            </div>
            {related.map((r) => (
              <Link
                key={r.id}
                href={`/notes/${r.id}`}
                className="mb-[7px] block rounded-[10px] bg-panel px-3.5 py-3 hover:bg-panel-deep"
              >
                <span className="float-right mt-0.5 font-mono text-[10px] text-ink-soft">
                  {r.similarity.toFixed(2)}
                </span>
                <b className="block text-[13.5px] font-semibold text-ink">
                  {r.heading}
                </b>
                <span className="mt-[3px] block text-[11.5px] text-ink-mid">
                  {r.domain} ·{" "}
                  <em className="not-italic text-red">{r.sub_category}</em>
                </span>
              </Link>
            ))}
          </>
        )}

        {citedIn.length > 0 && (
          <>
            <div className="mb-1 mt-7 text-[10.5px] font-bold uppercase tracking-[.14em] text-ink-soft">
              Cited in chats
            </div>
            {citedIn.map((c) => (
              <Link
                key={c.sessionId}
                href={`/chat/${c.sessionId}`}
                className="group block border-b border-hairline py-[9px] last:border-b-0"
              >
                <span className="block font-serif text-[13.5px] leading-[1.45] text-ink-mid group-hover:text-ink">
                  {c.title}
                </span>
                <time className="font-mono text-[10px] uppercase text-ink-soft">
                  {formatRelative(c.createdAt)} ago
                </time>
              </Link>
            ))}
          </>
        )}

        {related.length === 0 && citedIn.length === 0 && (
          <p className="text-[12px] leading-relaxed text-ink-soft">
            No connections yet — related notes and citing chats appear here as
            your collection grows.
          </p>
        )}
      </aside>
    </main>
  );
}

function MetaKV({ k, v }: { k: string; v: string }) {
  return (
    <div className="mb-3.5">
      <div className="mb-[3px] font-mono text-[9.5px] font-semibold uppercase tracking-[.12em] text-ink-soft">
        {k}
      </div>
      <div className="font-mono text-[12px] text-ink-mid">{v}</div>
    </div>
  );
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}
