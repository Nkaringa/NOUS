// POST /api/ingest/cc-session — Claude Code session ingest.
// Auth: bearer NOUS_INGEST_TOKEN (no cookie — middleware matcher skips this path).
//
// Body REQUIRES `workspace_id`. The skill prompts the user before posting:
// "Personal or which workspace?". We validate that NOUS_INGEST_USER_ID is a
// member of that workspace before any insert.

import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ccSessionBody } from "@/lib/zod-schemas";
import { embedText } from "@/lib/llm";
import {
  fetchTaxonomySnapshot,
  normalizeTaxonomyPair,
  bumpTaxonomy,
} from "@/lib/ingest/taxonomy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const expected = process.env.NOUS_INGEST_TOKEN;
  const userId = process.env.NOUS_INGEST_USER_ID;
  if (!expected || !userId) {
    return NextResponse.json(
      { error: "cc-session not configured (set NOUS_INGEST_TOKEN + NOUS_INGEST_USER_ID)" },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token || token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = ccSessionBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { workspace_id: workspaceId, items } = parsed.data;
  const supabase = createServiceClient();

  // Validate that NOUS_INGEST_USER_ID is a member of the target workspace.
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { error: "NOUS_INGEST_USER_ID is not a member of the target workspace" },
      { status: 403 },
    );
  }

  const snapshot = await fetchTaxonomySnapshot(supabase, workspaceId);
  const insertedIds: string[] = [];
  const errors: string[] = [];

  for (const item of items) {
    try {
      const norm = await normalizeTaxonomyPair({
        proposed: { domain: item.domain, sub_category: item.sub_category },
        snapshot,
      });

      const embedding = await embedText(`${item.heading}\n\n${item.definition_md}`);

      const { data: row, error: insertErr } = await supabase
        .from("notes")
        .insert({
          user_id: userId,
          workspace_id: workspaceId,
          heading: item.heading,
          body_md: item.body_md ?? null,
          definition_md: item.definition_md,
          example_md: item.example_md,
          domain: norm.canonical.domain,
          sub_category: norm.canonical.sub_category,
          source: "cc-session",
          embedding,
        })
        .select("id")
        .single();

      if (insertErr || !row) {
        errors.push(`${item.heading}: ${insertErr?.message ?? "insert failed"}`);
        continue;
      }

      insertedIds.push(row.id);
      await bumpTaxonomy(supabase, {
        workspaceId,
        domain: norm.canonical.domain,
        sub_category: norm.canonical.sub_category,
      });
      if (!snapshot.find(
        (e) => e.domain === norm.canonical.domain && e.sub_category === norm.canonical.sub_category,
      )) {
        snapshot.push({
          domain: norm.canonical.domain,
          sub_category: norm.canonical.sub_category,
          usage_count: 1,
        });
      }
    } catch (err) {
      errors.push(`${item.heading}: ${(err as Error).message}`);
    }
  }

  await supabase.from("ingest_log").insert({
    user_id: userId,
    workspace_id: workspaceId,
    mode: "cc-session",
    model: "claude-in-session",
    raw_input: JSON.stringify(items.map((i) => i.heading)),
    parsed_count: insertedIds.length,
    status: errors.length === 0 ? "success" : insertedIds.length > 0 ? "partial" : "failed",
    error: errors.length > 0 ? errors.join("\n") : null,
  });

  return NextResponse.json({
    inserted: insertedIds.length,
    ids: insertedIds,
    workspace_id: workspaceId,
    errors: errors.length > 0 ? errors : undefined,
  });
}
