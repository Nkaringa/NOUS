// Per-heading ingest pipeline: categorize → normalize → define → embed → insert.
// Reference: docs/ARCHITECTURE.md §3 Ingestion Pipeline Detail.
//
// All inserts include both user_id (the actor — who added it) and
// workspace_id (which shared collection the note belongs to). RLS allows
// the insert as long as the user is a member of the workspace.

import type { SupabaseClient } from "@supabase/supabase-js";
import { withJsonSchema, embedText } from "@/lib/llm";
import {
  categorizerPrompt,
  definerPrompt,
  definerRetryPrompt,
  hasCodeFence,
  isTechnicalDomain,
} from "@/lib/llm/prompts";
import { categorizerSchema, definerSchema } from "@/lib/zod-schemas";
import {
  fetchTaxonomySnapshot,
  normalizeTaxonomyPair,
  bumpTaxonomy,
} from "./taxonomy";
import type { Note, NoteSource, TaxonomySnapshot } from "@/lib/types";

export type IngestItemResult =
  | { ok: true; note: Note; modelsUsed: string[] }
  | { ok: false; heading: string; error: string };

export type NearDuplicate = {
  id: string;
  heading: string;
  domain: string;
  sub_category: string;
  similarity: number;
};

/**
 * Cosine-similarity threshold for the vector-based near-duplicate check.
 * Lower than you'd expect (0.85) because existing notes are embedded as
 * "heading + definition_md" but the dupe check embeds the new heading
 * alone — heading-vs-(heading+def) lands around 0.7-0.9 even for clear
 * matches. The case-insensitive string match below catches exact restates;
 * vector kicks in for fuzzy ones like "BGP" vs "BGP convergence".
 */
export const DUPLICATE_THRESHOLD = 0.85;

/**
 * Look up the most-similar existing note in the workspace.
 *
 * Two checks in order:
 *   1. Case-insensitive exact match on heading (after trim). Returns
 *      similarity = 1.0 — catches "SHIM VPC" vs "shim VPC" cleanly without
 *      depending on embedding quality.
 *   2. Vector similarity via the existing search_notes_vec RPC. Catches
 *      fuzzy near-restates where the wording differs.
 *
 * Returns null if neither check turns up anything past the threshold.
 */
export async function findNearDuplicate(args: {
  supabase: SupabaseClient;
  workspaceId: string;
  heading: string;
}): Promise<NearDuplicate | null> {
  const { supabase, workspaceId, heading } = args;
  const trimmed = heading.trim();
  if (!trimmed) return null;

  // 1. Case-insensitive exact match on heading. Escape ilike's wildcards
  //    (% and _) so headings containing them ("100% renewable") still
  //    match exactly instead of acting as a pattern.
  const ilikePattern = trimmed.replace(/[\\%_]/g, "\\$&");
  const { data: exactMatches } = await supabase
    .from("notes")
    .select("id, heading, domain, sub_category")
    .eq("workspace_id", workspaceId)
    .ilike("heading", ilikePattern)
    .limit(1);
  const exact = (exactMatches ?? [])[0];
  if (exact) {
    return {
      id: exact.id as string,
      heading: exact.heading as string,
      domain: exact.domain as string,
      sub_category: exact.sub_category as string,
      similarity: 1.0,
    };
  }

  // 2. Vector similarity.
  let embedding: number[];
  try {
    embedding = await embedText(trimmed);
  } catch {
    return null;
  }
  if (embedding.length === 0) return null;

  const { data, error } = await supabase.rpc("search_notes_vec", {
    p_workspace_id: workspaceId,
    p_embedding: embedding,
    p_k: 1,
  });
  if (error) return null;
  const rows = (data ?? []) as Array<{ id: string; similarity: number }>;
  const top = rows[0];
  if (!top || top.similarity < DUPLICATE_THRESHOLD) return null;

  const { data: noteRow } = await supabase
    .from("notes")
    .select("id, heading, domain, sub_category")
    .eq("id", top.id)
    .maybeSingle();
  if (!noteRow) return null;

  return {
    id: noteRow.id as string,
    heading: noteRow.heading as string,
    domain: noteRow.domain as string,
    sub_category: noteRow.sub_category as string,
    similarity: top.similarity,
  };
}

export async function ingestHeading(args: {
  supabase: SupabaseClient;
  userId: string;
  workspaceId: string;
  heading: string;
  body: string | null;
  source: NoteSource;
  snapshot: TaxonomySnapshot;
}): Promise<IngestItemResult> {
  const { supabase, userId, workspaceId, heading, body, source, snapshot } = args;
  const modelsUsed: string[] = [];

  try {
    // 1. Categorize.
    const cat = await withJsonSchema({
      prompt: categorizerPrompt({ heading, body, taxonomy: snapshot }),
      schema: categorizerSchema,
      toolName: "submit_categorization",
      description: "Submit the (domain, sub_category, confidence, reasoning) for this heading.",
      maxTokens: 400,
    });
    modelsUsed.push(cat.model);

    let domain = cat.data.domain;
    let sub_category = cat.data.sub_category;

    if (cat.data.confidence < 0.5) {
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

    // 2. Define + exemplify.
    let def = await withJsonSchema({
      prompt: definerPrompt({ heading, domain, sub_category, body }),
      schema: definerSchema,
      toolName: "submit_definition",
      description: "Submit the definition, example, and key_terms for this heading.",
      maxTokens: 1500,
    });
    modelsUsed.push(def.model);

    // Technical-topic retry: if the domain is technical but the example has
    // no ``` fence, run definer once more with a stricter follow-up prompt.
    // Don't block the whole ingest if the retry also fails — accept the
    // best output we got.
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

    // 3. Embed.
    const embedding = await embedText(`${heading}\n\n${def.data.definition_md}`);

    // 4. Insert note.
    const { data: inserted, error: insertErr } = await supabase
      .from("notes")
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        heading,
        body_md: body,
        definition_md: def.data.definition_md,
        example_md: def.data.example_md,
        domain,
        sub_category,
        source,
        confidence: cat.data.confidence,
        key_terms: def.data.key_terms,
        embedding,
      })
      .select("id, user_id, workspace_id, heading, body_md, definition_md, example_md, domain, sub_category, source, confidence, key_terms, created_at, updated_at")
      .single();

    if (insertErr || !inserted) {
      throw new Error(`insert failed: ${insertErr?.message ?? "unknown"}`);
    }

    await bumpTaxonomy(supabase, { workspaceId, domain, sub_category });

    return { ok: true, note: inserted as Note, modelsUsed };
  } catch (err) {
    return { ok: false, heading, error: (err as Error).message };
  }
}

export async function ingestBatch(args: {
  supabase: SupabaseClient;
  userId: string;
  workspaceId: string;
  items: Array<{ heading: string; body: string | null }>;
  source: NoteSource;
  onProgress?: (event: {
    index: number;
    total: number;
    result: IngestItemResult;
  }) => void | Promise<void>;
}): Promise<{
  results: IngestItemResult[];
  modelsUsed: string[];
}> {
  const snapshot = await fetchTaxonomySnapshot(args.supabase, args.workspaceId);
  const allModels = new Set<string>();
  const results: IngestItemResult[] = [];

  for (let i = 0; i < args.items.length; i++) {
    const item = args.items[i]!;
    const res = await ingestHeading({
      supabase: args.supabase,
      userId: args.userId,
      workspaceId: args.workspaceId,
      heading: item.heading,
      body: item.body,
      source: args.source,
      snapshot,
    });
    results.push(res);
    if (res.ok) {
      res.modelsUsed.forEach((m) => allModels.add(m));
      if (!snapshot.find(
        (e) => e.domain === res.note.domain && e.sub_category === res.note.sub_category,
      )) {
        snapshot.push({
          domain: res.note.domain,
          sub_category: res.note.sub_category,
          usage_count: 1,
        });
      }
    }
    if (args.onProgress) {
      await args.onProgress({ index: i, total: args.items.length, result: res });
    }
  }

  return { results, modelsUsed: Array.from(allModels) };
}
