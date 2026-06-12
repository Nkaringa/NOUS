import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkspaceNameEditor } from "@/components/WorkspaceNameEditor";
import { MemberList } from "@/components/MemberList";
import { InviteManager } from "@/components/InviteManager";
import { DangerZone } from "@/components/DangerZone";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, owner_id, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!ws) notFound();

  // Confirm membership (RLS already enforces, but explicit check is friendlier)
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) notFound();

  const isOwner = ws.owner_id === user.id;

  const [notesRes, membersRes, taxRes] = await Promise.all([
    supabase
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", id),
    supabase
      .from("workspace_members")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", id),
    supabase.from("notes").select("domain, sub_category").eq("workspace_id", id),
  ]);
  const noteCount = notesRes.count ?? 0;
  const memberCount = membersRes.count ?? 0;
  const domains = new Set<string>();
  const pairs = new Set<string>();
  for (const r of taxRes.data ?? []) {
    domains.add(r.domain as string);
    pairs.add(`${r.domain}|${r.sub_category}`);
  }

  return (
    <main className="mx-auto grid max-w-[1180px] grid-cols-1 gap-10 px-9 pb-24 pt-12 md:grid-cols-[230px_minmax(0,1fr)] md:gap-[88px]">
      {/* ── LEFT: identity rail ── */}
      <aside className="md:sticky md:top-8 md:self-start">
        <Link href="/workspaces" className="text-[12px] text-ink-mid hover:text-red">
          ← All workspaces
        </Link>
        <h1 className="mt-[18px] text-[22px]">{ws.name}</h1>
        <span className="mt-2 inline-block rounded-[5px] bg-red-bg px-2 py-[3px] text-[9px] font-bold uppercase tracking-[.08em] text-red-deep">
          {isOwner ? "Owner" : "Member"}
        </span>

        <div className="mt-[26px] border-t border-hairline pt-5">
          <RailKV k="Notes" v={String(noteCount)} />
          <RailKV k="Members" v={String(memberCount)} />
          <RailKV k="Sub-categories" v={String(pairs.size)} />
          <RailKV
            k="Created"
            v={new Date(ws.created_at)
              .toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
              .toUpperCase()}
          />
        </div>

        <div className="mt-3 border-t border-hairline pt-5">
          <WorkspaceNameEditor
            workspaceId={ws.id}
            initialName={ws.name}
            canEdit={isOwner}
          />
        </div>
      </aside>

      {/* ── MAIN: spacious vertical flow ── */}
      <div className="min-w-0 max-w-[760px]">
        <section>
          <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[.15em] text-ink">
            Members · {memberCount}
          </div>
          <MemberList
            workspaceId={ws.id}
            currentUserId={user.id}
            ownerId={ws.owner_id}
          />
        </section>

        {isOwner && (
          <section className="mt-16">
            <div className="mb-3.5 text-[11px] font-bold uppercase tracking-[.15em] text-ink">
              Invites
            </div>
            <InviteManager workspaceId={ws.id} />
          </section>
        )}

        <section className="mt-16">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col rounded-[14px] bg-panel p-5">
              <b className="text-[14px] font-semibold text-ink">Taxonomy</b>
              <span className="mt-1.5 text-[12.5px] leading-[1.55] text-ink-mid">
                {pairs.size} sub-categor{pairs.size === 1 ? "y" : "ies"} across{" "}
                {domains.size} domain{domains.size === 1 ? "" : "s"}.
                {isOwner ? " Rename or merge to clean up drift." : ""}
              </span>
              <Link
                href={`/workspaces/${ws.id}/taxonomy`}
                className="mt-auto pt-3.5 text-[13px] font-medium text-red hover:text-red-deep"
              >
                Open taxonomy →
              </Link>
            </div>
            {isOwner ? (
              <DangerZone workspaceId={ws.id} workspaceName={ws.name} />
            ) : (
              <div className="rounded-[14px] bg-panel p-5 text-[12.5px] leading-[1.55] text-ink-mid">
                Only the owner can delete this workspace. You can leave from the
                member list above.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function RailKV({ k, v }: { k: string; v: string }) {
  return (
    <div className="mb-[15px]">
      <div className="mb-[3px] font-mono text-[9.5px] font-semibold uppercase tracking-[.12em] text-ink-soft">
        {k}
      </div>
      <div className="font-mono text-[12px] text-ink-mid">{v}</div>
    </div>
  );
}
