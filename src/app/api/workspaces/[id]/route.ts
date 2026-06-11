// PATCH /api/workspaces/[id] — rename a workspace (owner only)
// DELETE /api/workspaces/[id] — delete a workspace + cascade (owner only)

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renameWorkspaceBody } from "@/lib/zod-schemas";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = renameWorkspaceBody.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // RLS update policy = owner only.
  const { data, error } = await supabase
    .from("workspaces")
    .update({ name: parsed.data.name, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, owner_id, created_at, updated_at")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data)
    return Response.json(
      { error: "not found or not owner" },
      { status: 404 },
    );
  return Response.json({ workspace: data });
}

export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // RLS delete policy = owner only. Cascades to notes/sessions/logs/members/invites.
  const { error } = await supabase.from("workspaces").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
