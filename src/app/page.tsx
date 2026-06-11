import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/active";
import { DashboardCaptureBar } from "@/components/DashboardCaptureBar";
import { KnowledgeMap, type KnowledgeDomain } from "@/components/KnowledgeMap";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const workspaceId = await getActiveWorkspaceId(supabase, user.id);
  if (!workspaceId) {
    return (
      <main className="mx-auto max-w-[1100px] px-8 py-10">
        <p className="text-[14px] text-ink-mid">
          No workspace available.{" "}
          <Link href="/workspaces" className="text-red hover:underline">
            Create one
          </Link>
          .
        </p>
      </main>
    );
  }

  const [wsRow, allNotesRes, recentNotesRes, recentSessionsRes] =
    await Promise.all([
      supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
      supabase
        .from("notes")
        .select("domain, sub_category, created_at")
        .eq("workspace_id", workspaceId),
      supabase
        .from("notes")
        .select("id, heading, definition_md, domain, sub_category, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("chat_sessions")
        .select("id, title, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(4),
    ]);

  const workspaceName = wsRow.data?.name ?? "Workspace";
  const allNotes = (allNotesRes.data ?? []) as Array<{
    domain: string;
    sub_category: string;
    created_at: string;
  }>;
  const recentNotes = recentNotesRes.data ?? [];
  const recentSessions = recentSessionsRes.data ?? [];

  // Derive stats + the knowledge-map breakdown from the single all-notes pull.
  const domainSet = new Set<string>();
  const pairSet = new Set<string>();
  const byDomain = new Map<string, Map<string, number>>();
  let lastAdded: string | null = null;
  for (const n of allNotes) {
    domainSet.add(n.domain);
    pairSet.add(`${n.domain}|${n.sub_category}`);
    const subs = byDomain.get(n.domain) ?? new Map<string, number>();
    subs.set(n.sub_category, (subs.get(n.sub_category) ?? 0) + 1);
    byDomain.set(n.domain, subs);
    if (!lastAdded || n.created_at > lastAdded) lastAdded = n.created_at;
  }

  const knowledge: KnowledgeDomain[] = Array.from(byDomain.entries())
    .map(([domain, subs]) => {
      const subList = Array.from(subs.entries())
        .map(([sub_category, count]) => ({ sub_category, count }))
        .sort((a, b) => b.count - a.count);
      return {
        domain,
        total: subList.reduce((acc, s) => acc + s.count, 0),
        subs: subList,
      };
    })
    .sort((a, b) => b.total - a.total);

  return (
    <main className="mx-auto max-w-[1100px] px-8 py-10">
      {/* Workspace context — small, since the nav switcher already names it */}
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-mid">
        {workspaceName}
      </div>

      {/* Hero: capture / ask */}
      <DashboardCaptureBar />

      {/* Stats */}
      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-hairline bg-hairline sm:grid-cols-4">
        <Stat value={allNotes.length} label="Notes" />
        <Stat value={domainSet.size} label="Domains" />
        <Stat value={pairSet.size} label="Sub-categories" />
        <Stat
          value={lastAdded ? formatRelative(lastAdded) : "—"}
          label="Last added"
        />
      </div>

      {/* Knowledge map */}
      {knowledge.length > 0 && (
        <section className="mt-12">
          <SectionHeader
            title="Knowledge map"
            link={{ href: "/notes", label: "browse notes" }}
          />
          <div className="mt-4">
            <KnowledgeMap domains={knowledge} />
          </div>
        </section>
      )}

      {/* Recent notes + chats */}
      <div className="mt-12 grid gap-12 md:grid-cols-2">
        <section>
          <SectionHeader
            title="Recent notes"
            link={{ href: "/notes", label: "view all" }}
          />
          {recentNotes.length === 0 ? (
            <EmptyState>
              Nothing yet —{" "}
              <Link href="/ingest" className="text-red hover:underline">
                add your first note
              </Link>
              .
            </EmptyState>
          ) : (
            <ul className="mt-1">
              {recentNotes.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/notes/${n.id}`}
                    className="group -mx-2 block rounded border-b border-hairline px-2 py-3 hover:bg-bg-soft"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[14px] font-medium text-ink">
                        {n.heading}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-ink-mid">
                        {formatRelative(n.created_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-ink-mid">
                      {n.domain}
                      <span className="px-1.5 text-ink-soft">·</span>
                      <span className="text-red">{n.sub_category}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader
            title="Recent chats"
            link={{ href: "/chat", label: "view all" }}
          />
          {recentSessions.length === 0 ? (
            <EmptyState>
              No chats yet —{" "}
              <Link href="/chat" className="text-red hover:underline">
                start one
              </Link>
              .
            </EmptyState>
          ) : (
            <ul className="mt-1">
              {recentSessions.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/chat/${s.id}`}
                    className="group -mx-2 grid grid-cols-[1fr_auto] items-center gap-4 rounded border-b border-hairline px-2 py-3 hover:bg-bg-soft"
                  >
                    <div className="truncate text-[14px] text-ink">{s.title}</div>
                    <div className="font-mono text-[11px] text-ink-mid">
                      {formatRelative(s.created_at)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="bg-bg px-4 py-4">
      <div className="font-mono text-[22px] font-medium leading-none text-ink">
        {value}
      </div>
      <div className="mt-2 text-[11px] uppercase tracking-wider text-ink-mid">
        {label}
      </div>
    </div>
  );
}

function SectionHeader({
  title,
  link,
}: {
  title: string;
  link?: { href: string; label: string };
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-hairline-strong pb-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink">
        {title}
      </h2>
      {link && (
        <Link href={link.href} className="text-[11px] text-red hover:underline">
          {link.label}
        </Link>
      )}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-[13px] text-ink-mid">{children}</p>;
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}
