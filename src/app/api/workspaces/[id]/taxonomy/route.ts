// PATCH /api/workspaces/[id]/taxonomy
//   Body shapes:
//     { from: {domain, sub_category}, to: {domain, sub_category} }   — pair rename/merge
//     { from_domain: string, to_domain: string }                      — domain-wide rename
//
// Owner-only. RLS on notes lets any member update them, so we check
// workspace ownership explicitly before issuing the mass UPDATE.

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  renameTaxonomyPairBody,
  renameTaxonomyDomainBody,
} from "@/lib/zod-schemas";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data: ws } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (!ws) return Response.json({ error: "not found" }, { status: 404 });
  if (ws.owner_id !== user.id) {
    return Response.json({ error: "owner only" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const pairParse = renameTaxonomyPairBody.safeParse(body);
  if (pairParse.success) {
    const { from, to } = pairParse.data;
    if (from.domain === to.domain && from.sub_category === to.sub_category) {
      return Response.json({ updated_count: 0 });
    }
    const { data, error } = await supabase
      .from("notes")
      .update({ domain: to.domain, sub_category: to.sub_category })
      .eq("workspace_id", workspaceId)
      .eq("domain", from.domain)
      .eq("sub_category", from.sub_category)
      .select("id");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ updated_count: (data ?? []).length });
  }

  const domainParse = renameTaxonomyDomainBody.safeParse(body);
  if (domainParse.success) {
    const { from_domain, to_domain } = domainParse.data;
    if (from_domain === to_domain) {
      return Response.json({ updated_count: 0 });
    }
    const { data, error } = await supabase
      .from("notes")
      .update({ domain: to_domain })
      .eq("workspace_id", workspaceId)
      .eq("domain", from_domain)
      .select("id");
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ updated_count: (data ?? []).length });
  }

  return Response.json(
    {
      error: "validation",
      details: { pair: pairParse.error.flatten(), domain: domainParse.error.flatten() },
    },
    { status: 422 },
  );
}
