// POST /api/notes/[id]/regenerate — re-run definer on the stored heading,
// body, and existing (domain, sub_category) for one note. Updates
// definition_md + example_md + re-embeds. Does NOT touch the taxonomy
// (use /recategorize for that).
//
// Use case: backfill notes created under DEFINER_PROMPT v1.0 (no code
// fence for technical topics) once v1.1 is live.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withJsonSchema, embedText } from "@/lib/llm";
import {
  definerPrompt,
  definerRetryPrompt,
  hasCodeFence,
  isTechnicalDomain,
} from "@/lib/llm/prompts";
import { definerSchema } from "@/lib/zod-schemas";

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

  const heading = note.heading as string;
  const body = (note.body_md as string | null) ?? null;
  const domain = note.domain as string;
  const sub_category = note.sub_category as string;
  const workspaceId = note.workspace_id as string;

  try {
    let def = await withJsonSchema({
      prompt: definerPrompt({ heading, domain, sub_category, body }),
      schema: definerSchema,
      toolName: "submit_definition",
      description: "Submit the definition, example, and key_terms for this heading.",
      maxTokens: 1500,
    });
    const modelsUsed = [def.model];

    if (isTechnicalDomain(domain) && !hasCodeFence(def.data.example_md)) {
      const retry = await withJsonSchema({
        prompt: definerRetryPrompt({
          heading,
          domain,
          sub_category,
          body,
          rejected_example_md: def.data.example_md,
        }),
        schema: definerSchema,
        toolName: "submit_definition",
        description: "Re-submit with a fenced code block in example_md.",
        maxTokens: 1500,
      });
      modelsUsed.push(retry.model);
      if (hasCodeFence(retry.data.example_md)) {
        def = retry;
      }
    }

    const embedding = await embedText(`${heading}\n\n${def.data.definition_md}`);

    const { data: updated, error: updateErr } = await supabase
      .from("notes")
      .update({
        definition_md: def.data.definition_md,
        example_md: def.data.example_md,
        key_terms: def.data.key_terms,
        embedding,
      })
      .eq("id", id)
      .select(
        "id, user_id, heading, body_md, definition_md, example_md, domain, sub_category, source, confidence, key_terms, created_at, updated_at",
      )
      .maybeSingle();
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    if (!updated) return NextResponse.json({ error: "update failed" }, { status: 500 });

    await supabase.from("ingest_log").insert({
      user_id: user.id,
      workspace_id: workspaceId,
      mode: "regenerate",
      model: modelsUsed.join(","),
      raw_input: heading,
      parsed_count: 1,
      status: "success",
      note_ids: [id],
    });

    return NextResponse.json({ note: updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
