// GET  /api/workspaces — list workspaces the current user belongs to (with counts)
// POST /api/workspaces — create a new workspace; current user becomes owner + member

import type { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createWorkspaceBody } from "@/lib/zod-schemas";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // 1. Memberships for this user.
  const { data: memberRows, error: memErr } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, joined_at")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true });
  if (memErr) return Response.json({ error: memErr.message }, { status: 500 });

  const workspaceIds = (memberRows ?? []).map((r) => r.workspace_id as string);
  if (workspaceIds.length === 0) {
    return Response.json({ workspaces: [] });
  }

  // 2. Workspace metadata.
  const { data: wsRows, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, name, owner_id, created_at, updated_at")
    .in("id", workspaceIds);
  if (wsErr) return Response.json({ error: wsErr.message }, { status: 500 });

  // 3. Service-role counts (members + notes) across all returned workspaces.
  const svc = createServiceClient();
  const [allMembersRes, allNotesRes] = await Promise.all([
    svc
      .from("workspace_members")
      .select("workspace_id")
      .in("workspace_id", workspaceIds),
    svc
      .from("notes")
      .select("workspace_id")
      .in("workspace_id", workspaceIds),
  ]);

  const memberCount = aggregate(
    (allMembersRes.data ?? []) as Array<{ workspace_id: string }>,
  );
  const noteCount = aggregate(
    (allNotesRes.data ?? []) as Array<{ workspace_id: string }>,
  );

  const wsById = new Map(
    (wsRows ?? []).map((w) => [w.id as string, w] as const),
  );
  const memberByWs = new Map(
    (memberRows ?? []).map((r) => [r.workspace_id as string, r] as const),
  );

  const workspaces = workspaceIds
    .map((wsId) => {
      const ws = wsById.get(wsId);
      const mem = memberByWs.get(wsId);
      if (!ws || !mem) return null;
      return {
        id: ws.id as string,
        name: ws.name as string,
        owner_id: ws.owner_id as string,
        created_at: ws.created_at as string,
        updated_at: ws.updated_at as string,
        role: mem.role as "owner" | "member",
        joined_at: mem.joined_at as string,
        note_count: noteCount.get(wsId) ?? 0,
        member_count: memberCount.get(wsId) ?? 1,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return Response.json({ workspaces });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = createWorkspaceBody.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // Service-role for the two-step insert (workspace + first member row).
  // RLS would let the workspace insert through but block the members row
  // because the user is not yet a member (chicken-and-egg).
  const svc = createServiceClient();

  const { data: ws, error: wsErr } = await svc
    .from("workspaces")
    .insert({ name: parsed.data.name, owner_id: user.id })
    .select("id, name, owner_id, created_at, updated_at")
    .single();
  if (wsErr || !ws) {
    return Response.json(
      { error: `create failed: ${wsErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  const { error: memErr } = await svc.from("workspace_members").insert({
    workspace_id: ws.id,
    user_id: user.id,
    role: "owner",
  });
  if (memErr) {
    await svc.from("workspaces").delete().eq("id", ws.id);
    return Response.json(
      { error: `member insert failed: ${memErr.message}` },
      { status: 500 },
    );
  }

  return Response.json({ workspace: ws });
}

function aggregate(rows: Array<{ workspace_id: string }>): Map<string, number> {
  const tally = new Map<string, number>();
  for (const r of rows) {
    tally.set(r.workspace_id, (tally.get(r.workspace_id) ?? 0) + 1);
  }
  return tally;
}
