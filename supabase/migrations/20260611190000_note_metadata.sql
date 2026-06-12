-- Note-level metadata for the UX redesign:
--
--   notes.confidence  — the categorizer's confidence for this note's
--                       (domain, sub_category). Shown on note detail +
--                       activity expansions; powers the needs-review
--                       filter. Null for notes ingested before this
--                       migration (backfills on regenerate/recategorize).
--
--   notes.key_terms   — the definer's 3-8 key terms. Always generated,
--                       never persisted until now. Shown as chips on the
--                       notes list + note detail rail.
--
--   ingest_log.note_ids — which notes a run created. Powers "open note →"
--                       links in the Activity daybook without fuzzy
--                       heading matching. Null for historic rows (the
--                       activity page falls back to heading match).
--
-- All nullable; no backfill required.

alter table public.notes
  add column confidence double precision,
  add column key_terms text[];

alter table public.ingest_log
  add column note_ids uuid[];
