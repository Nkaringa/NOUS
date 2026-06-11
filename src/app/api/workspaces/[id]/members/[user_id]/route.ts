// DELETE /api/workspaces/[id]/members/[user_id]
//   - self-leave: user_id === auth.uid()
//   - kick: owner removing someone else
//   - blocked: owner trying to remove themselves (must delete workspace instead)

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; user_id: string }> },
) {
  const { id: workspaceId, user_id: targetUserId } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // Block: owner can't leave their own workspace (would orphan it).
  // They have to delete the workspace if they want out.
  const { data: ws } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (ws && ws.owner_id === targetUserId) {
    return Response.json(
      {
        error:
          "the workspace owner can't leave or be removed — delete the workspace instead, or transfer ownership first",
      },
      { status: 409 },
    );
  }

  // RLS allows: members_self_leave (target = self) OR members_owner_remove (caller owns ws).
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUserId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
