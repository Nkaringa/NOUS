-- NOUS — Hybrid RAG retrieval RPCs.
-- Two functions called from /api/rag/query:
--   search_notes_fts: keyword search via Postgres tsvector + GIN
--   search_notes_vec: semantic search via pgvector cosine distance + HNSW
-- Both scope by auth.uid() (RLS-style), so passing user_id from the client
-- is unnecessary and unsafe.

create or replace function public.search_notes_fts(
  p_query text,
  p_k int default 20
)
returns table (id uuid, rank double precision)
language sql
stable
security invoker
as $$
  select
    n.id,
    ts_rank(n.fts, websearch_to_tsquery('english', p_query))::double precision as rank
  from public.notes n
  where n.user_id = auth.uid()
    and p_query is not null
    and length(trim(p_query)) > 0
    and n.fts @@ websearch_to_tsquery('english', p_query)
  order by rank desc
  limit greatest(p_k, 1);
$$;

create or replace function public.search_notes_vec(
  p_embedding vector(1536),
  p_k int default 20
)
returns table (id uuid, similarity double precision)
language sql
stable
security invoker
as $$
  select
    n.id,
    (1 - (n.embedding <=> p_embedding))::double precision as similarity
  from public.notes n
  where n.user_id = auth.uid()
    and n.embedding is not null
  order by n.embedding <=> p_embedding
  limit greatest(p_k, 1);
$$;

grant execute on function public.search_notes_fts(text, int) to authenticated;
grant execute on function public.search_notes_vec(vector(1536), int) to authenticated;
