// GET /api/taxonomy — full taxonomy hierarchy for the active workspace.
//
// Dual auth: cookie session OR bearer token (for the CC-session skill).
// When using bearer, you MUST pass ?workspace_id=... query param.

import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fetchTaxonomyTree, fetchTaxonomySnapshot } from "@/lib/ingest/taxonomy";
import { resolveWorkspaceId } from "@/lib/workspaces/active";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") ?? "";
  const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const explicitWs = request.nextUrl.searchParams.get("workspace_id");

  let workspaceId: string | null = null;
  let supabase;

  if (bearerToken && bearerToken === process.env.NOUS_INGEST_TOKEN) {
    const userId = process.env.NOUS_INGEST_USER_ID ?? null;
    if (!userId) {
      return NextResponse.json(
        { error: "NOUS_INGEST_USER_ID not configured" },
        { status: 503 },
      );
    }
    if (!explicitWs) {
      return NextResponse.json(
        { error: "workspace_id query param required when using bearer auth" },
        { status: 400 },
      );
    }
    supabase = createServiceClient();
    // Validate cc-session user is a member of the requested workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", explicitWs)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) {
      return NextResponse.json(
        { error: "cc-session user is not a member of that workspace" },
        { status: 403 },
      );
    }
    workspaceId = explicitWs;
  } else {
    supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    workspaceId = await resolveWorkspaceId({
      supabase,
      userId: user.id,
      explicit: explicitWs,
    });
    if (!workspaceId) {
      return NextResponse.json({ error: "no workspace available" }, { status: 403 });
    }
  }

  try {
    const [tree, flat] = await Promise.all([
      fetchTaxonomyTree(supabase, workspaceId),
      fetchTaxonomySnapshot(supabase, workspaceId),
    ]);
    return NextResponse.json({ tree, flat, workspace_id: workspaceId });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
