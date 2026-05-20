import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { AcceptInviteButton } from "@/components/AcceptInviteButton";

export const dynamic = "force-dynamic";

type PreviewStatus =
  | "valid"
  | "already_member"
  | "expired"
  | "exhausted"
  | "not_found";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Send unauth'd users through login, preserving the invite URL
    redirect(`/login?next=/join/${encodeURIComponent(token)}`);
  }

  // Server-side preview (using service-role since the user isn't a member yet)
  const svc = createServiceClient();
  const { data: invite } = await svc
    .from("workspace_invites")
    .select("id, workspace_id, expires_at, max_uses, used_count")
    .eq("token", token)
    .maybeSingle();

  let status: PreviewStatus;
  let workspaceName: string | null = null;
  let memberCount = 0;

  if (!invite) {
    status = "not_found";
  } else if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    status = "expired";
  } else if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
    status = "exhausted";
  } else {
    const [{ data: existing }, { data: ws }, { count }] = await Promise.all([
      svc
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", invite.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      svc
        .from("workspaces")
        .select("id, name")
        .eq("id", invite.workspace_id)
        .single(),
      svc
        .from("workspace_members")
        .select("user_id", { count: "exact", head: true })
        .eq("workspace_id", invite.workspace_id),
    ]);
    workspaceName = ws?.name ?? null;
    memberCount = count ?? 0;
    status = existing ? "already_member" : "valid";
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-[520px] flex-col justify-center px-8 py-10">
      <Link href="/" className="text-[12px] text-ink-mid hover:text-red">
        ← Dashboard
      </Link>

      <div className="mt-6">
        {status === "not_found" && (
          <Card
            tone="red"
            title="Invite not found"
            body="This invite link doesn't exist — it may have been revoked, or the URL is mistyped."
          />
        )}

        {status === "expired" && (
          <Card
            tone="red"
            title="Invite expired"
            body="This invite link has expired. Ask the workspace owner for a fresh link."
          />
        )}

        {status === "exhausted" && (
          <Card
            tone="red"
            title="Invite already used up"
            body="This invite has reached its maximum uses. Ask the workspace owner for a fresh link."
          />
        )}

        {status === "already_member" && (
          <Card
            tone="neutral"
            title="You're already in this workspace"
            body={`You're already a member of "${workspaceName}". Open it to keep going.`}
          >
            <AcceptInviteButton
              token={token}
              label={`Open "${workspaceName}"`}
            />
          </Card>
        )}

        {status === "valid" && (
          <Card
            tone="neutral"
            title={`Join "${workspaceName}"?`}
            body={`This workspace has ${memberCount} member${memberCount === 1 ? "" : "s"}. Joining gives you read/write access to its notes, chats, and activity log. You'll keep your own personal workspace too.`}
          >
            <AcceptInviteButton
              token={token}
              label={`Accept invite and join`}
            />
          </Card>
        )}
      </div>
    </main>
  );
}

function Card({
  title,
  body,
  tone,
  children,
}: {
  title: string;
  body: string;
  tone: "neutral" | "red";
  children?: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === "red"
          ? "rounded border border-red bg-red-bg/40 p-6"
          : "rounded border border-hairline-strong bg-bg-input p-6"
      }
    >
      <h1
        className={
          tone === "red"
            ? "text-[18px] font-medium text-red-deep"
            : "font-serif text-[24px] font-medium tracking-tight text-ink"
        }
      >
        {title}
      </h1>
      <p
        className={
          tone === "red"
            ? "mt-2 text-[13px] text-ink-mid"
            : "mt-3 font-serif text-[15px] leading-relaxed text-ink"
        }
      >
        {body}
      </p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
