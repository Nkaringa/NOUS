// Hybrid retriever: FTS (keyword) + pgvector (semantic), fused with
// Reciprocal Rank Fusion. Returns ordered notes ready for the RAG prompt,
// with per-note relevance signals so the route can detect "no relevant
// notes" cases.
//
// Reference: docs/SPEC.md F5; docs/ARCHITECTURE.md §2 RAG pipeline.

import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "@/lib/llm";

export type RetrievedNote = {
  id: string;
  heading: string;
  definition_md: string;
  example_md: string | null;
  domain: string;
  sub_category: string;
  vec_similarity: number; // 0..1, higher = more semantically similar (0 if not in vec results)
  fts_rank: number;        // >0 if matched FTS, 0 otherwise
  fused_score: number;     // RRF fused score
};

const RRF_K = 60;
const PER_SOURCE_K = 20;

export async function hybridSearch(args: {
  supabase: SupabaseClient;
  query: string;
  k: number;
}): Promise<RetrievedNote[]> {
  const { supabase, query, k } = args;
  const trimmed = query.trim();
  if (!trimmed) return [];

  // 1. Embed query.
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(trimmed);
  } catch {
    queryEmbedding = [];
  }

  // 2. Parallel keyword + semantic search.
  const [ftsRes, vecRes] = await Promise.all([
    supabase.rpc("search_notes_fts", { p_query: trimmed, p_k: PER_SOURCE_K }),
    queryEmbedding.length > 0
      ? supabase.rpc("search_notes_vec", {
          p_embedding: queryEmbedding,
          p_k: PER_SOURCE_K,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const ftsRows = (ftsRes.data ?? []) as Array<{ id: string; rank: number }>;
  const vecRows = (vecRes.data ?? []) as Array<{ id: string; similarity: number }>;

  // Build per-id score maps for later attachment.
  const ftsScoreById = new Map(ftsRows.map((r) => [r.id, r.rank]));
  const vecScoreById = new Map(vecRows.map((r) => [r.id, r.similarity]));

  // 3. Reciprocal Rank Fusion.
  const fused = new Map<string, number>();
  ftsRows.forEach((row, i) => {
    fused.set(row.id, (fused.get(row.id) ?? 0) + 1 / (RRF_K + i + 1));
  });
  vecRows.forEach((row, i) => {
    fused.set(row.id, (fused.get(row.id) ?? 0) + 1 / (RRF_K + i + 1));
  });

  if (fused.size === 0) return [];

  // 4. Top K ids by fused score.
  const topEntries = Array.from(fused.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, k);
  const topIds = topEntries.map(([id]) => id);

  // 5. Hydrate notes (preserves fusion order, attaches per-note signals).
  const { data: notes } = await supabase
    .from("notes")
    .select("id, heading, definition_md, example_md, domain, sub_category")
    .in("id", topIds);

  const byId = new Map((notes ?? []).map((n) => [n.id, n]));
  const out: RetrievedNote[] = [];
  for (const [id, fusedScore] of topEntries) {
    const note = byId.get(id);
    if (!note) continue;
    out.push({
      ...note,
      vec_similarity: vecScoreById.get(id) ?? 0,
      fts_rank: ftsScoreById.get(id) ?? 0,
      fused_score: fusedScore,
    });
  }
  return out;
}

// Tunable. Empirically text-embedding-3-small reports ~0.7+ for paraphrases,
// ~0.4-0.6 for genuinely related topics, < 0.3 for noise. Slightly stricter
// (0.35) than the previous batch-level threshold (0.3) because this now
// gates each note individually rather than the whole batch.
const MIN_VEC_SIMILARITY = 0.35;

/**
 * Filter retrieved notes to only those individually relevant. A note passes
 * if it had any FTS keyword match OR its vector similarity meets the
 * threshold. The result is used for BOTH the displayed "Retrieved sources"
 * row AND the LLM context — keeping the model's view consistent with the
 * user's view.
 *
 * If the returned list is empty, the caller should treat this as a
 * "no relevant notes" case (banner + general-knowledge answer).
 */
export function filterRelevantNotes(notes: RetrievedNote[]): RetrievedNote[] {
  return notes.filter(
    (n) => n.fts_rank > 0 || n.vec_similarity >= MIN_VEC_SIMILARITY,
  );
}
