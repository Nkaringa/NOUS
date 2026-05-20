// DELETE /api/workspaces/[id]/invites/[invite_id] — revoke an active invite (owner only)

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; invite_id: string }> },
) {
  const { id: workspaceId, invite_id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // RLS: invites_delete policy = owner only.
  const { error } = await supabase
    .from("workspace_invites")
    .delete()
    .eq("id", invite_id)
    .eq("workspace_id", workspaceId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
