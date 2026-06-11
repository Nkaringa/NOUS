// GET /api/workspaces/[id]/members — list members of a workspace
// (caller must be a member; emails fetched via service-role auth admin API)

import type { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // RLS lets the user see all rows of workspaces they're in.
  const { data: members, error } = await supabase
    .from("workspace_members")
    .select("id, user_id, role, joined_at")
    .eq("workspace_id", id)
    .order("joined_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!members || members.length === 0)
    return Response.json({ members: [] });

  // Hydrate user emails via service-role auth admin lookup.
  const svc = createServiceClient();
  const enriched = await Promise.all(
    members.map(async (m) => {
      const { data } = await (
        svc.auth as unknown as {
          admin: { getUserById: (id: string) => Promise<{ data: { user: { email?: string } | null } }> };
        }
      ).admin.getUserById(m.user_id);
      return { ...m, email: data?.user?.email ?? null };
    }),
  );

  return Response.json({ members: enriched });
}
