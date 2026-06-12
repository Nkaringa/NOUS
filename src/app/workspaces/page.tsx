import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/active";
import { CreateWorkspaceForm } from "@/components/CreateWorkspaceForm";
import { SetActiveButton } from "@/components/SetActiveButton";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [activeId, { data: memberRows }] = await Promise.all([
    getActiveWorkspaceId(supabase, user.id),
    supabase
      .from("workspace_members")
      .select("workspace_id, role, joined_at")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: true }),
  ]);

  const wsIds = (memberRows ?? []).map((r) => r.workspace_id as string);

  type WsRow = { id: string; name: string; owner_id: string; created_at: string };
  let wsRows: WsRow[] = [];
  const countsByWs = new Map<string, { notes: number; members: number }>();
  const lastActiveByWs = new Map<string, string>();

  if (wsIds.length > 0) {
    const [{ data: workspaces }, { data: noteRows }, { data: memberAll }] =
      await Promise.all([
        supabase
          .from("workspaces")
          .select("id, name, owner_id, created_at")
          .in("id", wsIds),
        supabase
          .from("notes")
          .select("workspace_id, created_at")
          .in("workspace_id", wsIds),
        supabase
          .from("workspace_members")
          .select("workspace_id")
          .in("workspace_id", wsIds),
      ]);
    wsRows = (workspaces ?? []) as WsRow[];
    for (const n of noteRows ?? []) {
      const k = n.workspace_id as string;
      const prev = countsByWs.get(k) ?? { notes: 0, members: 0 };
      countsByWs.set(k, { ...prev, notes: prev.notes + 1 });
      const ts = n.created_at as string;
      const prevTs = lastActiveByWs.get(k);
      if (!prevTs || ts > prevTs) lastActiveByWs.set(k, ts);
    }
    for (const m of memberAll ?? []) {
      const k = m.workspace_id as string;
      const prev = countsByWs.get(k) ?? { notes: 0, members: 0 };
      countsByWs.set(k, { ...prev, members: prev.members + 1 });
    }
  }

  const roleById = new Map(
    (memberRows ?? []).map(
      (r) => [r.workspace_id as string, r.role as "owner" | "member"] as const,
    ),
  );

  return (
    <main className="mx-auto max-w-[760px] px-9 pb-[90px] pt-11">
      <h1>Workspaces</h1>
      <p className="mt-1 max-w-[560px] text-[13px] text-ink-mid">
        A workspace is a shared collection of notes, chats, and activity — one
        for solo work, others shared with collaborators.
      </p>

      <div className="mb-1 mt-10 text-[11px] font-bold uppercase tracking-[.15em] text-ink">
        Your workspaces
      </div>
      <div className="border-t border-hairline">
        {wsRows.length === 0 && (
          <p className="py-4 text-[13px] text-ink-mid">
            You don&apos;t have any workspaces yet.
          </p>
        )}
        {wsRows.map((w) => {
          const isActive = w.id === activeId;
          const counts = countsByWs.get(w.id) ?? { notes: 0, members: 1 };
          const role = roleById.get(w.id) ?? "member";
          const lastActive = lastActiveByWs.get(w.id);
          const meta = [
            `${counts.notes} NOTE${counts.notes === 1 ? "" : "S"}`,
            `${counts.members} MEMBER${counts.members === 1 ? "" : "S"}`,
            role.toUpperCase(),
            ...(lastActive ? [`ACTIVE ${formatRelative(lastActive)} AGO`] : []),
          ].join(" · ");

          return (
            <div
              key={w.id}
              className="flex items-center gap-4 border-b border-hairline px-1 py-[18px] hover:-mx-4 hover:rounded-xl hover:border-transparent hover:bg-panel hover:px-4"
            >
              <span className="flex shrink-0">
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-bg bg-panel-deep text-[12px] font-semibold text-ink-mid">
                  {w.name.charAt(0).toUpperCase()}
                </span>
                {counts.members > 1 && (
                  <span className="-ml-[9px] flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-bg bg-panel-deep font-mono text-[10px] font-semibold text-ink-mid">
                    +{counts.members - 1}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <Link
                    href={`/workspaces/${w.id}/settings`}
                    className="truncate text-[15.5px] font-semibold text-ink hover:text-red"
                  >
                    {w.name}
                  </Link>
                  {isActive && (
                    <span className="shrink-0 rounded-[5px] bg-red-bg px-[7px] py-[3px] text-[9px] font-bold uppercase tracking-[.08em] text-red-deep">
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-[11.5px] text-ink-soft">
                  {meta}
                </div>
              </div>
              {!isActive && <SetActiveButton workspaceId={w.id} />}
              <Link
                href={`/workspaces/${w.id}/settings`}
                className="shrink-0 text-[12.5px] font-medium text-ink-mid hover:text-ink"
              >
                Settings →
              </Link>
            </div>
          );
        })}
      </div>

      <div className="mb-3.5 mt-10 text-[11px] font-bold uppercase tracking-[.15em] text-ink">
        Create a new workspace
      </div>
      <CreateWorkspaceForm />
    </main>
  );
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}M`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}H`;
  return `${Math.floor(diff / 86_400_000)}D`;
}
