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

  return (
    <main className="mx-auto max-w-[820px] px-8 py-10">
      <Link href="/workspaces" className="text-[12px] text-ink-mid hover:text-red">
        ← All workspaces
      </Link>

      <header className="mt-4 mb-10">
        <h1 className="text-[22px] font-semibold tracking-tight">{ws.name}</h1>
        <p className="mt-1 text-[13px] text-ink-mid">
          You are {isOwner ? "the owner" : "a member"} of this workspace.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-mid">
          Name
        </h2>
        <WorkspaceNameEditor
          workspaceId={ws.id}
          initialName={ws.name}
          canEdit={isOwner}
        />
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-mid">
          Members
        </h2>
        <MemberList
          workspaceId={ws.id}
          currentUserId={user.id}
          ownerId={ws.owner_id}
        />
      </section>

      {isOwner && (
        <section className="mb-10">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-mid">
            Invites
          </h2>
          <InviteManager workspaceId={ws.id} />
        </section>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-ink-mid">
          Taxonomy
        </h2>
        <Link
          href={`/workspaces/${ws.id}/taxonomy`}
          className="inline-block rounded border border-hairline-strong px-3 py-1.5 text-[12px] text-ink-mid hover:bg-bg-soft hover:text-ink"
        >
          {isOwner ? "Rename or merge sub-categories →" : "View taxonomy →"}
        </Link>
      </section>

      {isOwner && (
        <section>
          <DangerZone workspaceId={ws.id} workspaceName={ws.name} />
        </section>
      )}
    </main>
  );
}
