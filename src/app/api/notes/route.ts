// GET /api/notes — list notes in the active workspace.
// Query params: domain, sub_category, q (full-text), limit, offset, workspace_id

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspaceId } from "@/lib/workspaces/active";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const workspaceId = await resolveWorkspaceId({
    supabase,
    userId: user.id,
    explicit: sp.get("workspace_id"),
  });
  if (!workspaceId) {
    return NextResponse.json({ error: "no workspace available" }, { status: 403 });
  }

  const domain = sp.get("domain");
  const sub_category = sp.get("sub_category");
  const q = sp.get("q");
  const limit = Math.min(Number(sp.get("limit") ?? 50), 200);
  const offset = Math.max(Number(sp.get("offset") ?? 0), 0);

  let query = supabase
    .from("notes")
    .select(
      "id, user_id, workspace_id, heading, body_md, definition_md, example_md, domain, sub_category, source, created_at, updated_at",
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (domain) query = query.eq("domain", domain);
  if (sub_category) query = query.eq("sub_category", sub_category);
  if (q) query = query.textSearch("fts", q, { type: "websearch" });

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ notes: data ?? [], total: count ?? 0 });
}
