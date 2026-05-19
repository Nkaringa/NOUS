-- NOUS — Initial schema
-- Creates: notes, taxonomy, ingest_log, chat_sessions, chat_messages
-- Plus: pgvector + pg_trgm extensions, indexes, RLS policies
-- Matches: docs/SPEC.md §3.2 DDL and docs/ARCHITECTURE.md §5 RLS

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists vector;
create extension if not exists pg_trgm;

-- ============================================================
-- Tables
-- ============================================================

-- notes: one row per learned topic
create table public.notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  heading       text not null,
  body_md       text,
  definition_md text not null,
  example_md    text,
  domain        text not null,
  sub_category  text not null,
  source        text not null check (source in ('ui', 'bulk', 'cc-session', 'api')),
  embedding     vector(1536),
  fts           tsvector generated always as (
                  to_tsvector(
                    'english',
                    coalesce(heading, '') || ' ' ||
                    coalesce(definition_md, '') || ' ' ||
                    coalesce(body_md, '')
                  )
                ) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- taxonomy: per-user canonical Domain/Sub-Category pairs + aliases
create table public.taxonomy (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  domain       text not null,
  sub_category text not null,
  alias_of     uuid references public.taxonomy(id) on delete set null,
  usage_count  int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (user_id, domain, sub_category)
);

-- ingest_log: audit trail for every ingest / edit
create table public.ingest_log (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  mode          text not null check (mode in ('ui', 'bulk', 'cc-session', 'api', 'recategorize')),
  model         text not null,
  raw_input     text not null,
  parsed_count  int  not null default 0,
  status        text not null check (status in ('success', 'partial', 'failed')),
  error         text,
  created_at    timestamptz not null default now()
);

-- chat_sessions: containers for RAG conversations
create table public.chat_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now()
);

-- chat_messages: messages within a chat_session
create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content_md text not null,
  citations  jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index notes_user_domain_idx     on public.notes (user_id, domain, sub_category);
create index notes_user_created_idx    on public.notes (user_id, created_at desc);
create index notes_fts_idx             on public.notes using gin (fts);
create index notes_embedding_idx       on public.notes using hnsw (embedding vector_cosine_ops);

create index taxonomy_user_idx         on public.taxonomy (user_id, domain);
create index taxonomy_domain_trgm_idx  on public.taxonomy using gin (domain gin_trgm_ops);
create index taxonomy_sub_trgm_idx     on public.taxonomy using gin (sub_category gin_trgm_ops);

create index ingest_log_user_idx       on public.ingest_log (user_id, created_at desc);

create index chat_sessions_user_idx    on public.chat_sessions (user_id, created_at desc);
create index chat_messages_session_idx on public.chat_messages (session_id, created_at);

-- ============================================================
-- updated_at trigger for notes
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger notes_set_updated_at
  before update on public.notes
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row-Level Security
-- ============================================================

alter table public.notes          enable row level security;
alter table public.taxonomy       enable row level security;
alter table public.ingest_log     enable row level security;
alter table public.chat_sessions  enable row level security;
alter table public.chat_messages  enable row level security;

-- notes
create policy notes_select on public.notes for select using (auth.uid() = user_id);
create policy notes_insert on public.notes for insert with check (auth.uid() = user_id);
create policy notes_update on public.notes for update using (auth.uid() = user_id);
create policy notes_delete on public.notes for delete using (auth.uid() = user_id);

-- taxonomy
create policy taxonomy_select on public.taxonomy for select using (auth.uid() = user_id);
create policy taxonomy_insert on public.taxonomy for insert with check (auth.uid() = user_id);
create policy taxonomy_update on public.taxonomy for update using (auth.uid() = user_id);
create policy taxonomy_delete on public.taxonomy for delete using (auth.uid() = user_id);

-- ingest_log
create policy ingest_log_select on public.ingest_log for select using (auth.uid() = user_id);
create policy ingest_log_insert on public.ingest_log for insert with check (auth.uid() = user_id);

-- chat_sessions
create policy chat_sessions_select on public.chat_sessions for select using (auth.uid() = user_id);
create policy chat_sessions_insert on public.chat_sessions for insert with check (auth.uid() = user_id);
create policy chat_sessions_update on public.chat_sessions for update using (auth.uid() = user_id);
create policy chat_sessions_delete on public.chat_sessions for delete using (auth.uid() = user_id);

-- chat_messages: ownership via parent chat_session
create policy chat_messages_select on public.chat_messages for select
  using (exists (
    select 1 from public.chat_sessions s
    where s.id = chat_messages.session_id and s.user_id = auth.uid()
  ));

create policy chat_messages_insert on public.chat_messages for insert
  with check (exists (
    select 1 from public.chat_sessions s
    where s.id = chat_messages.session_id and s.user_id = auth.uid()
  ));

create policy chat_messages_delete on public.chat_messages for delete
  using (exists (
    select 1 from public.chat_sessions s
    where s.id = chat_messages.session_id and s.user_id = auth.uid()
  ));
