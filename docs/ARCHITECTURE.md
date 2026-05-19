# NOUS — Architecture

High-level system design. All decisions traceable to `docs/IDEA.md` and `docs/SPEC.md`.

---

## 1. Stack Summary

| Layer | Choice | Why |
|---|---|---|
| Frontend + API | Next.js 15 App Router (TypeScript) | Single codebase, Server Components, route handlers, streaming-native |
| UI kit | Tailwind CSS + shadcn/ui | Lightweight, accessible primitives; no vendor lock-in |
| Auth | Supabase Auth (email magic link) | Server-side session via `@supabase/ssr` |
| DB | Supabase Postgres + pgvector | One vendor for auth/DB/RLS/vector |
| Vector ext | `pgvector` (HNSW index) | Production-grade, ~10ms top-K on 100k rows |
| FTS | Postgres `tsvector` + GIN | Native, no external search service |
| LLM | Anthropic SDK (primary) + OpenAI SDK (fallback) | Best reasoning + mature embeddings |
| Streaming | Vercel AI SDK (`ai`) | Provider-agnostic streaming + tool use |
| Validation | Zod | Every API + LLM boundary |
| Deploy | Vercel (app) + Supabase (DB) | Zero-ops, both have generous free tiers |

---

## 2. System Diagram

```
                       ┌──────────────────────────────────────────┐
                       │                CLIENT                    │
                       │  Next.js React (Server + Client comps)   │
                       │  /ingest  /notes  /chat  /settings       │
                       └──────────────┬───────────────────────────┘
                                      │ fetch / SSE
                       ┌──────────────▼───────────────────────────┐
                       │            API ROUTES (Next.js)          │
                       │  /api/ingest  /api/rag/query  ...        │
                       └──────┬────────────────┬──────────────────┘
                              │                │
                ┌─────────────▼────┐    ┌──────▼────────────┐
                │ INGESTION PIPELINE│   │   RAG PIPELINE    │
                │                  │    │                   │
                │ parse → categorize│   │ embed query →     │
                │  → define → embed │   │  FTS + pgvector → │
                │  → insert         │   │  RRF fuse →       │
                │                  │    │  stream answer    │
                └─────────────┬────┘    └──────┬────────────┘
                              │                │
                       ┌──────▼────────────────▼──────────┐
                       │  Supabase Postgres (RLS-isolated)│
                       │  notes / taxonomy / ingest_log / │
                       │  chat_sessions / chat_messages   │
                       └──────────────────────────────────┘
                              ▲
                              │  bearer NOUS_INGEST_TOKEN
                       ┌──────┴──────────────────────────┐
                       │   CLAUDE CODE SESSION (skill)   │
                       │   nous-ingest: runs prompts     │
                       │   in-session, POSTs JSON        │
                       └─────────────────────────────────┘
```

Three planes:
- **Client plane** — React UI calls API routes.
- **Ingestion plane** — two entry points (API mode via Next routes, CC-session mode via skill), one shared normalizer → categorizer → definer → embedder → DB writer.
- **RAG plane** — query → hybrid retrieval (FTS + vector) → fuse → stream.

---

## 3. Ingestion Pipeline Detail

### 3.1 API mode

```
User UI ─▶ POST /api/ingest
              │
              ▼
        parse headings (lines or md headers)
              │
              ▼
        for each heading:
          ├─ categorize() ──┐
          │   anthropic.messages → JSON
          │   on fail: openai.chat → JSON
          ├─ normalizeTaxonomy()
          │   trgm match → reuse | LLM normalize
          ├─ define() ──┐
          │   anthropic → JSON (def + example)
          ├─ embed()
          │   openai text-embedding-3-small (1536d)
          └─ insert notes + bump taxonomy.usage_count
              │
              ▼
        write ingest_log row → return Note[]
```

### 3.2 Claude Code session mode

```
User → Claude Code: "/nous-ingest path/to/headings.md"
              │
              ▼
   Claude (in-session) reads file
              │
              ▼
   Claude runs CATEGORIZER_PROMPT mentally (no API call)
   Claude runs DEFINER_PROMPT mentally
              │
              ▼
   Claude POST /api/ingest/cc-session
        Headers: Authorization: Bearer NOUS_INGEST_TOKEN
        Body: { items: [{heading, domain, sub_category, definition_md, example_md, key_terms}] }
              │
              ▼
   Server: validate Zod schema
        normalizeTaxonomy() per item
        embed() per item (uses OpenAI embeddings — Claude can't generate vectors)
        insert + log
              │
              ▼
   Return {inserted, ids} → Claude reports to user
```

Embeddings always run server-side (Claude in-session cannot produce vectors). This is why CC-session mode still needs server connectivity.

---

## 4. Database Layout

Five tables, all RLS-protected:

| Table | Purpose | Key indexes |
|---|---|---|
| `notes` | One row per learned topic | `(user_id, domain, sub_category)` btree, `fts` GIN, `embedding` HNSW |
| `taxonomy` | Per-user canonical Domain/Sub pairs + aliases | unique `(user_id, domain, sub_category)` |
| `ingest_log` | Audit trail for every ingest/edit | `(user_id, created_at desc)` |
| `chat_sessions` | RAG conversation containers | `(user_id, created_at desc)` |
| `chat_messages` | Messages within a session | `(session_id, created_at)` |

Foreign keys cascade on user delete (GDPR-friendly hard delete).

---

## 5. RLS Policies

Every user-scoped table:

```sql
alter table <t> enable row level security;
create policy "<t>_select" on <t> for select using (auth.uid() = user_id);
create policy "<t>_insert" on <t> for insert with check (auth.uid() = user_id);
create policy "<t>_update" on <t> for update using (auth.uid() = user_id);
create policy "<t>_delete" on <t> for delete using (auth.uid() = user_id);
```

`chat_messages` joins through `chat_sessions.user_id` (no direct `user_id` column).

The `/api/ingest/cc-session` route uses the service-role key server-side and explicitly sets `user_id` from the token's mapped user — never trusts client input for that field.

---

## 6. Frontend Components

### Routes
```
app/
  page.tsx                  → dashboard (recent notes + activity)
  (auth)/login/page.tsx
  ingest/page.tsx
  notes/page.tsx
  notes/[id]/page.tsx
  chat/page.tsx
  settings/page.tsx
  api/
    ingest/route.ts
    ingest/single/route.ts
    ingest/cc-session/route.ts
    notes/route.ts
    notes/[id]/route.ts
    notes/[id]/recategorize/route.ts
    taxonomy/route.ts
    rag/query/route.ts
    log/route.ts
```

### Key components
- `<IngestForm>` — single + bulk tabs; streaming progress.
- `<NoteCard>` — heading, taxonomy chips, definition, collapsible example.
- `<TaxonomyTree>` — collapsible Domain → Sub-Category sidebar with counts.
- `<RAGChat>` — streaming message list + input + citation chips.
- `<CitationBadge>` — `[^note_id]` resolves to hover-card preview + link.
- `<ActivityFeed>` — last N ingest_log rows.

All data fetching is Server Components by default; only `<RAGChat>` and `<IngestForm>` are Client Components (need streaming + state).

---

## 7. Secrets & Config

`.env.local` (and Vercel env):

```
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SUPABASE_URL=https://<proj>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # server-only
NOUS_INGEST_TOKEN=<random-32-byte-hex>     # for CC-session skill
NOUS_INGEST_USER_ID=<your auth.users.id>   # which user CC-session writes for
```

The `SUPABASE_SERVICE_ROLE_KEY` and `NOUS_INGEST_TOKEN` are never sent to the client. The CC-session route uses them together to insert on behalf of `NOUS_INGEST_USER_ID`.

---

## 8. Deployment

- **App:** Vercel — `git push` to main → auto-deploy. Edge runtime for `/api/rag/query` (streaming), Node runtime for ingest routes.
- **DB:** Supabase managed Postgres. Migrations via `supabase/migrations/*.sql`, applied by `supabase db push` in CI.
- **CI:** GitHub Actions — typecheck, lint, run migration linter, deploy preview on PR.
- **Observability:** Vercel logs for runtime, Supabase logs for SQL, structured JSON logging from API routes including model name + token counts for cost tracking.
