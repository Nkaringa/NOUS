// GET /api/invites/[token] — preview an invite before accepting.
// Returns workspace name + member count + invite status (valid/expired/exhausted/already_member).
// Service-role: the previewing user is auth'd but isn't yet a member.

import type { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: invite } = await svc
    .from("workspace_invites")
    .select("id, workspace_id, expires_at, max_uses, used_count")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return Response.json({ status: "not_found" }, { status: 404 });
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return Response.json({ status: "expired" });
  }
  if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
    return Response.json({ status: "exhausted" });
  }

  // Check if user is already a member.
  const { data: existing } = await svc
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", invite.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const [{ data: ws }, { count: memberCount }] = await Promise.all([
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

  return Response.json({
    status: existing ? "already_member" : "valid",
    workspace: { id: ws?.id, name: ws?.name, member_count: memberCount ?? 0 },
  });
}
