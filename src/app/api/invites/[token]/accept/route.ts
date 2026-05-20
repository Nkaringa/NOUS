// POST /api/invites/[token]/accept — accept an invite.
// Adds the current user to the workspace, increments used_count, sets the
// active-workspace cookie to the new workspace, and returns the workspace.

import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ACTIVE_WS_COOKIE } from "@/lib/workspaces/active";

export const runtime = "nodejs";

export async function POST(
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
    return Response.json({ error: "invite not found" }, { status: 404 });
  }
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return Response.json({ error: "invite expired" }, { status: 410 });
  }
  if (invite.max_uses !== null && invite.used_count >= invite.max_uses) {
    return Response.json({ error: "invite exhausted" }, { status: 410 });
  }

  // Already a member? No-op success, switch active workspace.
  const { data: existing } = await svc
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", invite.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error: insertErr } = await svc.from("workspace_members").insert({
      workspace_id: invite.workspace_id,
      user_id: user.id,
      role: "member",
    });
    if (insertErr) {
      return Response.json(
        { error: `failed to join: ${insertErr.message}` },
        { status: 500 },
      );
    }
    await svc
      .from("workspace_invites")
      .update({ used_count: invite.used_count + 1 })
      .eq("id", invite.id);
  }

  // Switch active workspace to the newly-joined one.
  const jar = await cookies();
  jar.set(ACTIVE_WS_COOKIE, invite.workspace_id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  const { data: ws } = await svc
    .from("workspaces")
    .select("id, name")
    .eq("id", invite.workspace_id)
    .single();

  return Response.json({
    workspace: ws,
    already_member: !!existing,
  });
}
