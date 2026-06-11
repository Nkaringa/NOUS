-- Add 'regenerate' to the ingest_log.mode check constraint so the new
-- POST /api/notes/[id]/regenerate route can audit-log its runs.
--
-- regenerate = re-run DEFINER on an existing note (re-roll definition +
-- example_md). Distinct from 'recategorize' (re-run CATEGORIZER) and from
-- the original ingest modes.
--
-- The original constraint was created anonymously inline on the column;
-- postgres' auto-name may differ across environments, so we look it up
-- by table+column+contype and drop whatever's there before re-adding
-- under a stable name.

do $$
declare
  c_name text;
begin
  select conname into c_name
  from pg_constraint
  where conrelid = 'public.ingest_log'::regclass
    and contype  = 'c'
    and pg_get_constraintdef(oid) ilike '%mode%';

  if c_name is not null then
    execute format('alter table public.ingest_log drop constraint %I', c_name);
  end if;
end $$;

alter table public.ingest_log
  add constraint ingest_log_mode_check
  check (mode in ('ui', 'bulk', 'cc-session', 'api', 'recategorize', 'regenerate'));
