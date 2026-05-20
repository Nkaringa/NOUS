-- NOUS — Shared workspaces (Phase A schema)
--
-- Introduces a workspace model: every user owns a "Personal" workspace by
-- default, can own additional workspaces, and can join others via invite
-- link. All scoped data (notes / chat_sessions / ingest_log) now belongs
-- to a workspace; RLS is rewritten to check workspace_members membership
-- rather than direct user_id ownership.
--
-- Migration order:
--   1. Drop existing user-based RLS policies (replaced below)
--   2. Create new tables: workspaces, workspace_members, workspace_invites
--   3. Add SECURITY DEFINER helper functions to avoid RLS recursion
--   4. Add workspace_id (nullable) to notes/chat_sessions/ingest_log
--   5. Data migration: one Personal workspace per existing user; backfill
--      workspace_id on all existing rows
--   6. Lock workspace_id as NOT NULL
--   7. Enable RLS + write new workspace-membership-based policies
--   8. Update search RPC functions to take workspace_id
--
-- Note: the taxonomy table is currently unused at runtime (counts are
-- derived from notes) — left untouched to keep this migration tight.
-- It still has its old user_id-based RLS policies, which is harmless.

-- ============================================================
-- 1. Drop existing user-based RLS policies on scoped tables
-- ============================================================
drop policy if exists notes_select          on public.notes;
drop policy if exists notes_insert          on public.notes;
drop policy if exists notes_update          on public.notes;
drop policy if exists notes_delete          on public.notes;

drop policy if exists ingest_log_select     on public.ingest_log;
drop policy if exists ingest_log_insert     on public.ingest_log;

drop policy if exists chat_sessions_select  on public.chat_sessions;
drop policy if exists chat_sessions_insert  on public.chat_sessions;
drop policy if exists chat_sessions_update  on public.chat_sessions;
drop policy if exists chat_sessions_delete  on public.chat_sessions;

drop policy if exists chat_messages_select  on public.chat_messages;
drop policy if exists chat_messages_insert  on public.chat_messages;
drop policy if exists chat_messages_delete  on public.chat_messages;

-- ============================================================
-- 2. New tables
-- ============================================================

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_id    uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index workspaces_owner_idx on public.workspaces(owner_id);

create table public.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'member' check (role in ('owner', 'member')),
  joined_at     timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members(user_id);
create index workspace_members_ws_idx   on public.workspace_members(workspace_id);

create table public.workspace_invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  token         text unique not null,
  created_by    uuid not null references auth.users(id) on delete cascade,
  expires_at    timestamptz,
  max_uses      int,
  used_count    int not null default 0,
  created_at    timestamptz not null default now()
);
create index workspace_invites_token_idx on public.workspace_invites(token);
create index workspace_invites_ws_idx    on public.workspace_invites(workspace_id);

-- ============================================================
-- 3. Helper functions (SECURITY DEFINER to avoid RLS recursion
--    when policies reference workspace_members)
-- ============================================================

create or replace function public.user_in_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  );
$$;
grant execute on function public.user_in_workspace(uuid) to authenticated;

create or replace function public.user_owns_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.workspaces
    where id = p_workspace_id and owner_id = auth.uid()
  );
$$;
grant execute on function public.user_owns_workspace(uuid) to authenticated;

-- ============================================================
-- 4. Add workspace_id columns (nullable for now)
-- ============================================================

alter table public.notes
  add column workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.ingest_log
  add column workspace_id uuid references public.workspaces(id) on delete cascade;

alter table public.chat_sessions
  add column workspace_id uuid references public.workspaces(id) on delete cascade;

-- ============================================================
-- 5. Data migration: per-user "Personal" workspace + backfill
-- ============================================================

do $$
declare
  u    record;
  ws_id uuid;
begin
  for u in select id from auth.users loop
    insert into public.workspaces (name, owner_id)
    values ('Personal', u.id)
    returning id into ws_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (ws_id, u.id, 'owner');

    update public.notes         set workspace_id = ws_id where user_id = u.id;
    update public.ingest_log    set workspace_id = ws_id where user_id = u.id;
    update public.chat_sessions set workspace_id = ws_id where user_id = u.id;
  end loop;
end $$;

-- ============================================================
-- 6. Lock workspace_id as NOT NULL + add indexes
-- ============================================================

alter table public.notes         alter column workspace_id set not null;
alter table public.ingest_log    alter column workspace_id set not null;
alter table public.chat_sessions alter column workspace_id set not null;

create index notes_workspace_idx         on public.notes(workspace_id, created_at desc);
create index ingest_log_workspace_idx    on public.ingest_log(workspace_id, created_at desc);
create index chat_sessions_workspace_idx on public.chat_sessions(workspace_id, created_at desc);

-- ============================================================
-- 7. Enable RLS + write new workspace-membership-based policies
-- ============================================================

-- workspaces: owners can read/write their own; members can read
alter table public.workspaces enable row level security;
create policy workspaces_select on public.workspaces for select
  using (public.user_in_workspace(id));
create policy workspaces_insert on public.workspaces for insert
  with check (owner_id = auth.uid());
create policy workspaces_update on public.workspaces for update
  using (owner_id = auth.uid());
create policy workspaces_delete on public.workspaces for delete
  using (owner_id = auth.uid());

-- workspace_members: members can see other members of workspaces they're in;
-- self can delete own row (leave); owner can delete anyone (remove member);
-- inserts done server-side via service-role (invite acceptance, ws creation)
alter table public.workspace_members enable row level security;
create policy members_select on public.workspace_members for select
  using (public.user_in_workspace(workspace_id));
create policy members_self_leave on public.workspace_members for delete
  using (user_id = auth.uid());
create policy members_owner_remove on public.workspace_members for delete
  using (public.user_owns_workspace(workspace_id));

-- workspace_invites: owner-only (read, create, revoke); acceptance via service-role
alter table public.workspace_invites enable row level security;
create policy invites_select on public.workspace_invites for select
  using (public.user_owns_workspace(workspace_id));
create policy invites_insert on public.workspace_invites for insert
  with check (public.user_owns_workspace(workspace_id));
create policy invites_delete on public.workspace_invites for delete
  using (public.user_owns_workspace(workspace_id));

-- notes
create policy notes_select on public.notes for select
  using (public.user_in_workspace(workspace_id));
create policy notes_insert on public.notes for insert
  with check (public.user_in_workspace(workspace_id) and user_id = auth.uid());
create policy notes_update on public.notes for update
  using (public.user_in_workspace(workspace_id));
create policy notes_delete on public.notes for delete
  using (public.user_in_workspace(workspace_id));

-- ingest_log
create policy ingest_log_select on public.ingest_log for select
  using (public.user_in_workspace(workspace_id));
create policy ingest_log_insert on public.ingest_log for insert
  with check (public.user_in_workspace(workspace_id));

-- chat_sessions
create policy chat_sessions_select on public.chat_sessions for select
  using (public.user_in_workspace(workspace_id));
create policy chat_sessions_insert on public.chat_sessions for insert
  with check (public.user_in_workspace(workspace_id) and user_id = auth.uid());
create policy chat_sessions_update on public.chat_sessions for update
  using (public.user_in_workspace(workspace_id));
create policy chat_sessions_delete on public.chat_sessions for delete
  using (public.user_in_workspace(workspace_id));

-- chat_messages (joined via chat_sessions.workspace_id)
create policy chat_messages_select on public.chat_messages for select
  using (exists (
    select 1 from public.chat_sessions s
    where s.id = chat_messages.session_id
      and public.user_in_workspace(s.workspace_id)
  ));
create policy chat_messages_insert on public.chat_messages for insert
  with check (exists (
    select 1 from public.chat_sessions s
    where s.id = chat_messages.session_id
      and public.user_in_workspace(s.workspace_id)
  ));
create policy chat_messages_delete on public.chat_messages for delete
  using (exists (
    select 1 from public.chat_sessions s
    where s.id = chat_messages.session_id
      and public.user_in_workspace(s.workspace_id)
  ));

-- ============================================================
-- 8. Update search RPC functions to scope by workspace
-- ============================================================

drop function if exists public.search_notes_fts(text, int);
drop function if exists public.search_notes_vec(vector(1536), int);

create or replace function public.search_notes_fts(
  p_workspace_id uuid,
  p_query        text,
  p_k            int default 20
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
  where n.workspace_id = p_workspace_id
    and public.user_in_workspace(p_workspace_id)
    and p_query is not null
    and length(trim(p_query)) > 0
    and n.fts @@ websearch_to_tsquery('english', p_query)
  order by rank desc
  limit greatest(p_k, 1);
$$;

create or replace function public.search_notes_vec(
  p_workspace_id uuid,
  p_embedding    vector(1536),
  p_k            int default 20
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
  where n.workspace_id = p_workspace_id
    and public.user_in_workspace(p_workspace_id)
    and n.embedding is not null
  order by n.embedding <=> p_embedding
  limit greatest(p_k, 1);
$$;

grant execute on function public.search_notes_fts(uuid, text, int) to authenticated;
grant execute on function public.search_notes_vec(uuid, vector(1536), int) to authenticated;
