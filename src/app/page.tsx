import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/active";
import { DashboardCaptureBar } from "@/components/DashboardCaptureBar";
import { KnowledgeMap, type KnowledgeDomain } from "@/components/KnowledgeMap";

export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const workspaceId = await getActiveWorkspaceId(supabase, user.id);
  if (!workspaceId) {
    return (
      <main className="mx-auto max-w-[1680px] px-9 py-10">
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

  const [allNotesRes, recentNotesRes, recentSessionsRes] = await Promise.all([
    supabase
      .from("notes")
      .select("domain, sub_category, created_at")
      .eq("workspace_id", workspaceId),
    supabase
      .from("notes")
      .select("id, heading, domain, sub_category, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("chat_sessions")
      .select("id, title, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const allNotes = (allNotesRes.data ?? []) as Array<{
    domain: string;
    sub_category: string;
    created_at: string;
  }>;
  const recentNotes = recentNotesRes.data ?? [];
  const recentSessions = recentSessionsRes.data ?? [];

  // Derive stats + the knowledge-map breakdown from the single all-notes pull.
  const now = Date.now();
  const domainSet = new Set<string>();
  const pairSet = new Set<string>();
  const byDomain = new Map<string, Map<string, number>>();
  let lastAdded: string | null = null;
  let addedThisWeek = 0;
  let addedToday = 0;
  for (const n of allNotes) {
    domainSet.add(n.domain);
    pairSet.add(`${n.domain}|${n.sub_category}`);
    const subs = byDomain.get(n.domain) ?? new Map<string, number>();
    subs.set(n.sub_category, (subs.get(n.sub_category) ?? 0) + 1);
    byDomain.set(n.domain, subs);
    if (!lastAdded || n.created_at > lastAdded) lastAdded = n.created_at;
    const age = now - new Date(n.created_at).getTime();
    if (age < WEEK_MS) addedThisWeek++;
    if (age < DAY_MS) addedToday++;
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
    <main className="mx-auto grid max-w-[1680px] grid-cols-1 gap-11 px-9 pb-16 pt-9 lg:grid-cols-[236px_minmax(0,1fr)_330px]">
      {/* ── LEFT: stat rail ── */}
      <aside className="hidden lg:block">
        <Stat value={allNotes.length} label="Notes" first />
        <Stat value={domainSet.size} label="Domains" />
        <Stat value={pairSet.size} label="Sub-categories" />
        <Stat
          value={addedThisWeek}
          label="Added this week"
          delta={addedToday > 0 ? `+${addedToday} today` : undefined}
        />
        <Stat
          value={lastAdded ? formatRelative(lastAdded) : "—"}
          label="Since last note"
          last
        />
      </aside>

      {/* ── CENTER: capture + knowledge map ── */}
      <div className="min-w-0">
        <DashboardCaptureBar />

        {knowledge.length > 0 && (
          <section className="mt-11">
            <div className="mb-[18px] flex items-baseline justify-between">
              <h2 className="text-[11px] font-bold uppercase tracking-[.14em] text-ink">
                Knowledge map
              </h2>
              <Link href="/notes" className="text-[12px] font-medium text-red hover:underline">
                browse notes →
              </Link>
            </div>
            <KnowledgeMap domains={knowledge} />
          </section>
        )}
      </div>

      {/* ── RIGHT: feed ── */}
      <aside>
        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[.14em] text-ink">
            Recent notes
          </h2>
          <Link href="/notes" className="text-[12px] font-medium text-red hover:underline">
            view all
          </Link>
        </div>
        {recentNotes.length === 0 ? (
          <p className="text-[13px] text-ink-mid">
            Nothing yet —{" "}
            <Link href="/ingest" className="text-red hover:underline">
              add your first note
            </Link>
            .
          </p>
        ) : (
          recentNotes.map((n) => (
            <Link
              key={n.id}
              href={`/notes/${n.id}`}
              className="mb-2 block rounded-[10px] bg-panel px-[15px] py-[13px] hover:bg-panel-deep"
            >
              <span className="flex justify-between gap-2.5 text-[13.5px] font-medium text-ink">
                <span className="truncate">{n.heading}</span>
                <time className="shrink-0 font-mono text-[11px] font-normal text-ink-soft">
                  {formatRelative(n.created_at)}
                </time>
              </span>
              <span className="mt-1 block text-[11.5px] text-ink-soft">
                {n.domain} · <em className="not-italic text-red">{n.sub_category}</em>
              </span>
            </Link>
          ))
        )}

        <div className="h-[30px]" />

        <div className="mb-3.5 flex items-baseline justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[.14em] text-ink">
            Recent chats
          </h2>
          <Link href="/chat" className="text-[12px] font-medium text-red hover:underline">
            view all
          </Link>
        </div>
        {recentSessions.length === 0 ? (
          <p className="text-[13px] text-ink-mid">
            No chats yet —{" "}
            <Link href="/chat" className="text-red hover:underline">
              start one
            </Link>
            .
          </p>
        ) : (
          recentSessions.map((s) => (
            <Link
              key={s.id}
              href={`/chat/${s.id}`}
              className="mb-2 block rounded-[10px] bg-panel px-[15px] py-[13px] hover:bg-panel-deep"
            >
              <span className="flex justify-between gap-2.5">
                <span className="truncate font-serif text-[14.5px] text-ink">
                  {s.title}
                </span>
                <time className="shrink-0 font-mono text-[11px] text-ink-soft">
                  {formatRelative(s.created_at)}
                </time>
              </span>
            </Link>
          ))
        )}
      </aside>
    </main>
  );
}

function Stat({
  value,
  label,
  delta,
  first,
  last,
}: {
  value: number | string;
  label: string;
  delta?: string;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <div
      className={`py-[21px] ${first ? "pt-1.5" : ""} ${last ? "" : "border-b border-hairline"}`}
    >
      <div className="font-mono text-[32px] font-semibold leading-none tracking-[-.02em] text-ink">
        {value}
        {delta && (
          <span className="ml-2.5 inline-block translate-y-[-7px] rounded bg-ok-bg px-[7px] py-0.5 font-sans text-[11px] font-medium tracking-normal text-ok-ink">
            {delta}
          </span>
        )}
      </div>
      <div className="mt-2 text-[10.5px] font-semibold uppercase tracking-[.12em] text-ink-soft">
        {label}
      </div>
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
