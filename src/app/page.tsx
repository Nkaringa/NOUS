import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [recentNotesRes, recentSessionsRes, recentActivityRes] = await Promise.all([
    supabase
      .from("notes")
      .select("id, heading, domain, sub_category, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("chat_sessions")
      .select("id, title, created_at")
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("ingest_log")
      .select("id, mode, status, parsed_count, created_at")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const recentNotes = recentNotesRes.data ?? [];
  const recentSessions = recentSessionsRes.data ?? [];
  const recentActivity = recentActivityRes.data ?? [];

  return (
    <main className="mx-auto max-w-[1100px] px-8 py-10">
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-[13px] text-ink-mid">
            Signed in as {user?.email}
          </p>
        </div>
        <Link
          href="/ingest"
          className="rounded bg-red px-4 py-2 text-[13px] font-medium text-white hover:bg-red-deep"
        >
          + Capture
        </Link>
      </div>

      <div className="grid gap-12 md:grid-cols-[1.4fr_1fr]">
        {/* LEFT: recent notes */}
        <section>
          <SectionHeader title="Recent notes" meta={`${recentNotes.length === 0 ? "none yet" : recentNotes.length + " shown"}`} link={{ href: "/notes", label: "view all" }} />
          {recentNotes.length === 0 ? (
            <EmptyState>
              Nothing yet — <Link href="/ingest" className="text-red hover:underline">add your first note</Link>.
            </EmptyState>
          ) : (
            <ul>
              {recentNotes.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/notes/${n.id}`}
                    className="group -mx-2 grid grid-cols-[1fr_auto] items-center gap-4 rounded px-2 py-3 border-b border-hairline hover:bg-bg-soft"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[14px] text-ink group-hover:text-ink">
                        {n.heading}
                      </div>
                      <div className="mt-0.5 text-[11px] text-ink-mid">
                        {n.domain}
                        <span className="px-1.5 text-ink-soft">·</span>
                        <span className="text-red">{n.sub_category}</span>
                      </div>
                    </div>
                    <div className="font-mono text-[11px] text-ink-soft">
                      {formatRelative(n.created_at)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* RIGHT: recent chats + recent activity */}
        <section>
          <SectionHeader title="Recent chats" meta={`${recentSessions.length === 0 ? "none yet" : recentSessions.length + " shown"}`} link={{ href: "/chat", label: "view all" }} />
          {recentSessions.length === 0 ? (
            <EmptyState>
              No chats yet — <Link href="/chat" className="text-red hover:underline">start one</Link>.
            </EmptyState>
          ) : (
            <ul className="mb-10">
              {recentSessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/chat/${s.id}`}
                    className="group -mx-2 grid grid-cols-[1fr_auto] items-center gap-4 rounded px-2 py-3 border-b border-hairline hover:bg-bg-soft"
                  >
                    <div className="truncate text-[14px] text-ink">{s.title}</div>
                    <div className="font-mono text-[11px] text-ink-soft">
                      {formatRelative(s.created_at)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <SectionHeader title="Activity" meta="" link={{ href: "/activity", label: "view all" }} />
          {recentActivity.length === 0 ? (
            <EmptyState>No ingests yet.</EmptyState>
          ) : (
            <ul>
              {recentActivity.map((r) => (
                <li
                  key={r.id}
                  className="grid grid-cols-[50px_1fr_auto] items-baseline gap-3 border-b border-hairline py-2.5 text-[12px]"
                >
                  <span className="font-mono text-[11px] text-ink-soft">
                    {formatTime(r.created_at)}
                  </span>
                  <span className="text-ink">
                    <span className="text-ink-mid">{r.mode}</span>
                    <span className="px-1.5 text-ink-soft">·</span>
                    {r.parsed_count} {r.parsed_count === 1 ? "item" : "items"}
                  </span>
                  <StatusPill status={r.status as "success" | "partial" | "failed"} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function SectionHeader({
  title,
  meta,
  link,
}: {
  title: string;
  meta: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="mb-1 flex items-baseline justify-between border-b border-hairline py-2">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-ink">
        {title}
      </span>
      <span className="text-[11px] text-ink-soft">
        {meta}
        {link && (
          <>
            {meta && " · "}
            <Link href={link.href} className="text-red hover:underline">
              {link.label}
            </Link>
          </>
        )}
      </span>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-[13px] text-ink-mid">{children}</p>;
}

function StatusPill({ status }: { status: "success" | "partial" | "failed" }) {
  const styles = {
    success: "bg-ok-bg text-ok-ink",
    partial: "bg-warn-bg text-warn-ink",
    failed: "bg-red-bg text-red-deep",
  } as const;
  const labels = { success: "ok", partial: "partial", failed: "failed" } as const;
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
