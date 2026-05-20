import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/active";
import { WorkspaceSwitcher, type WorkspaceListItem } from "./WorkspaceSwitcher";

export async function Nav() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let workspaces: WorkspaceListItem[] = [];
  let activeId: string | null = null;

  if (user) {
    // Resolve active workspace AND fetch all memberships in parallel.
    const [active, { data: memberRows }] = await Promise.all([
      getActiveWorkspaceId(supabase, user.id),
      supabase
        .from("workspace_members")
        .select("workspace_id, role")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true }),
    ]);
    activeId = active;

    const wsIds = (memberRows ?? []).map((r) => r.workspace_id as string);
    if (wsIds.length > 0) {
      const { data: wsRows } = await supabase
        .from("workspaces")
        .select("id, name")
        .in("id", wsIds);
      // Member counts via a separate query (RLS allows visibility of all
      // members in workspaces the user is in).
      const { data: allMembers } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .in("workspace_id", wsIds);
      const counts = new Map<string, number>();
      for (const m of allMembers ?? []) {
        const wid = m.workspace_id as string;
        counts.set(wid, (counts.get(wid) ?? 0) + 1);
      }
      const wsById = new Map(
        (wsRows ?? []).map((w) => [w.id as string, w] as const),
      );
      const memberRoleById = new Map(
        (memberRows ?? []).map(
          (r) => [r.workspace_id as string, r.role as "owner" | "member"] as const,
        ),
      );
      workspaces = wsIds
        .map((id) => {
          const ws = wsById.get(id);
          const role = memberRoleById.get(id);
          if (!ws || !role) return null;
          return {
            id,
            name: ws.name as string,
            role,
            member_count: counts.get(id) ?? 1,
          } satisfies WorkspaceListItem;
        })
        .filter((x): x is WorkspaceListItem => x !== null);
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-bg">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-4 px-8 py-3.5">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-[15px] font-semibold tracking-wide">
            <span className="mr-1 text-red">●</span>NOUS
          </Link>
          {user && (
            <WorkspaceSwitcher workspaces={workspaces} activeId={activeId} />
          )}
        </div>
        <nav className="flex items-center gap-1">
          <NavLink href="/">Dashboard</NavLink>
          <NavLink href="/ingest">Ingest</NavLink>
          <NavLink href="/notes">Notes</NavLink>
          <NavLink href="/chat">Chat</NavLink>
          <NavLink href="/activity">Activity</NavLink>
        </nav>
        {user && (
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-xs text-ink-soft hover:text-ink"
            >
              Sign out
            </button>
          </form>
        )}
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded px-3 py-1.5 text-[13px] text-ink-mid hover:bg-bg-soft hover:text-ink"
    >
      {children}
    </Link>
  );
}
