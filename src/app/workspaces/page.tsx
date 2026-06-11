import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/active";
import { CreateWorkspaceForm } from "@/components/CreateWorkspaceForm";

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

  if (wsIds.length > 0) {
    const [{ data: workspaces }, { data: noteRows }, { data: memberAll }] =
      await Promise.all([
        supabase
          .from("workspaces")
          .select("id, name, owner_id, created_at")
          .in("id", wsIds),
        supabase.from("notes").select("workspace_id").in("workspace_id", wsIds),
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
    <main className="mx-auto max-w-[820px] px-8 py-10">
      <div className="mb-10">
        <h1>Workspaces</h1>
        <p className="mt-1 text-[13px] text-ink-mid">
          A workspace is a shared collection of notes, chats, and activity. You can
          have multiple — one for solo work, others shared with collaborators.
        </p>
      </div>

      <section className="mb-12">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-mid">
          Your workspaces
        </h2>
        <ul>
          {wsRows.length === 0 && (
            <li className="py-4 text-[13px] text-ink-mid">
              You don&apos;t have any workspaces yet.
            </li>
          )}
          {wsRows.map((w) => {
            const isActive = w.id === activeId;
            const counts = countsByWs.get(w.id) ?? { notes: 0, members: 1 };
            const role = roleById.get(w.id) ?? "member";
            return (
              <li
                key={w.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-hairline py-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[15px] font-medium text-ink">
                      {w.name}
                    </span>
                    {isActive && (
                      <span className="rounded bg-red-bg px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-deep">
                        active
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-[12px] text-ink-mid">
                    {counts.notes} note{counts.notes === 1 ? "" : "s"} ·{" "}
                    {counts.members} member{counts.members === 1 ? "" : "s"} ·{" "}
                    {role}
                  </div>
                </div>
                <Link
                  href={`/workspaces/${w.id}/settings`}
                  className="text-[12px] text-ink-mid hover:text-red"
                >
                  Settings
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-mid">
          Create a new workspace
        </h2>
        <CreateWorkspaceForm />
      </section>
    </main>
  );
}
