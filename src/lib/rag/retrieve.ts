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
  vec_similarity: number;
  fts_rank: number;
  fused_score: number;
};

const RRF_K = 60;
const PER_SOURCE_K = 20;

export async function hybridSearch(args: {
  supabase: SupabaseClient;
  workspaceId: string;
  query: string;
  k: number;
}): Promise<RetrievedNote[]> {
  const { supabase, workspaceId, query, k } = args;
  const trimmed = query.trim();
  if (!trimmed) return [];

  // 1. Embed query.
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedText(trimmed);
  } catch {
    queryEmbedding = [];
  }

  // 2. Parallel keyword + semantic search — both scoped to workspace.
  const [ftsRes, vecRes] = await Promise.all([
    supabase.rpc("search_notes_fts", {
      p_workspace_id: workspaceId,
      p_query: trimmed,
      p_k: PER_SOURCE_K,
    }),
    queryEmbedding.length > 0
      ? supabase.rpc("search_notes_vec", {
          p_workspace_id: workspaceId,
          p_embedding: queryEmbedding,
          p_k: PER_SOURCE_K,
        })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const ftsRows = (ftsRes.data ?? []) as Array<{ id: string; rank: number }>;
  const vecRows = (vecRes.data ?? []) as Array<{ id: string; similarity: number }>;

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

  // 5. Hydrate notes (workspace filter is defense-in-depth alongside RLS).
  const { data: notes } = await supabase
    .from("notes")
    .select("id, heading, definition_md, example_md, domain, sub_category")
    .eq("workspace_id", workspaceId)
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

const MIN_VEC_SIMILARITY = 0.35;

export function filterRelevantNotes(notes: RetrievedNote[]): RetrievedNote[] {
  return notes.filter(
    (n) => n.fts_rank > 0 || n.vec_similarity >= MIN_VEC_SIMILARITY,
  );
}
