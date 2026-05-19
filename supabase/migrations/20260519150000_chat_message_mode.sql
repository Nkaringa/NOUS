-- Add `mode` column to chat_messages so the client can render a distinct
-- banner when an assistant message was answered from general knowledge
-- (no matching notes were retrieved).
--
-- Possible values: NULL (normal RAG answer) | 'no_notes' (zero-retrieval).

alter table public.chat_messages
  add column mode text;

comment on column public.chat_messages.mode is
  'NULL = standard RAG answer; ''no_notes'' = answered from general knowledge because retrieval returned zero notes.';
