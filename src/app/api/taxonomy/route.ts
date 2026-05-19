// GET /api/taxonomy — full per-user taxonomy hierarchy with counts.
// Used by: the nous-ingest CC-session skill (to give Claude existing taxonomy
// before running CATEGORIZER_PROMPT) and the future <TaxonomyTree> sidebar.

import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { fetchTaxonomyTree, fetchTaxonomySnapshot } from "@/lib/ingest/taxonomy";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // Dual auth: cookie session OR bearer token (for the CC-session skill).
  const auth = request.headers.get("authorization") ?? "";
  const bearerToken = auth.startsWith("Bearer ") ? auth.slice(7) : null;

  let userId: string | null = null;
  let supabase;

  if (bearerToken && bearerToken === process.env.NOUS_INGEST_TOKEN) {
    userId = process.env.NOUS_INGEST_USER_ID ?? null;
    if (!userId) {
      return NextResponse.json(
        { error: "NOUS_INGEST_USER_ID not configured" },
        { status: 503 },
      );
    }
    supabase = createServiceClient();
  } else {
    supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    userId = user.id;
  }

  try {
    const [tree, flat] = await Promise.all([
      fetchTaxonomyTree(supabase, userId),
      fetchTaxonomySnapshot(supabase, userId),
    ]);
    return NextResponse.json({ tree, flat });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
