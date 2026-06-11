// POST /api/notes/[id]/recategorize — re-run categorizer + normalizer for one note.
// Workspace is determined by the note itself (each note belongs to one workspace).

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withJsonSchema } from "@/lib/llm";
import { categorizerPrompt } from "@/lib/llm/prompts";
import { categorizerSchema } from "@/lib/zod-schemas";
import {
  fetchTaxonomySnapshot,
  normalizeTaxonomyPair,
  bumpTaxonomy,
} from "@/lib/ingest/taxonomy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: note, error: fetchErr } = await supabase
    .from("notes")
    .select("id, heading, body_md, domain, sub_category, workspace_id")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });

  const workspaceId = note.workspace_id as string;
  const snapshot = await fetchTaxonomySnapshot(supabase, workspaceId);

  try {
    const { data: cat, model } = await withJsonSchema({
      prompt: categorizerPrompt({
        heading: note.heading,
        body: note.body_md,
        taxonomy: snapshot,
      }),
      schema: categorizerSchema,
      toolName: "submit_categorization",
      description: "Submit the (domain, sub_category, confidence, reasoning) for this heading.",
      maxTokens: 400,
    });

    let domain = cat.domain;
    let sub_category = cat.sub_category;
    if (cat.confidence < 0.5) {
      domain = "Uncategorized";
      sub_category = "Uncategorized";
    } else {
      const norm = await normalizeTaxonomyPair({
        proposed: { domain, sub_category },
        snapshot,
      });
      domain = norm.canonical.domain;
      sub_category = norm.canonical.sub_category;
    }

    const old = { domain: note.domain, sub_category: note.sub_category };

    await supabase.from("notes").update({ domain, sub_category }).eq("id", id);
    await bumpTaxonomy(supabase, { workspaceId, domain, sub_category });

    await supabase.from("ingest_log").insert({
      user_id: user.id,
      workspace_id: workspaceId,
      mode: "recategorize",
      model,
      raw_input: note.heading,
      parsed_count: 1,
      status: "success",
    });

    return NextResponse.json({ old, new: { domain, sub_category } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
