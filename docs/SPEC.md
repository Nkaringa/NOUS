# NOUS — Specification

Source of truth for what the app does. All schemas, contracts, and flows live here.

---

## 1. User Flows

### 1.1 Manual single-heading ingest (UI form)
1. User navigates to `/ingest`.
2. Enters a heading (required) and optional body text.
3. Clicks **Ingest**.
4. Server runs categorizer → definer → embedder → insert.
5. UI shows the resulting `Note` card with Domain, Sub-Category, Definition, Example.

### 1.2 Bulk paste ingest
1. User opens `/ingest` → switches to **Bulk** tab.
2. Pastes Markdown or line-delimited headings.
3. Server parses headings (one per non-empty line, or `#`/`##` markdown headers).
4. Each heading runs through the pipeline; progress streams to client.
5. Final summary: `{succeeded, failed, taxonomy_changes}`.

### 1.3 Claude Code session ingest
1. User runs `/nous-ingest` skill inside a Claude Code session.
2. Skill reads headings from message or file path.
3. Claude (in-session) executes `CATEGORIZER_PROMPT` and `DEFINER_PROMPT` locally.
4. Skill POSTs structured JSON to `/api/ingest/cc-session` with bearer `NOUS_INGEST_TOKEN`.
5. Server validates, normalizes taxonomy, embeds, inserts. Returns row count.

### 1.4 RAG Q&A
1. User opens `/chat`, types a question.
2. Server runs hybrid retriever (FTS + pgvector), top-K=8.
3. Re-rank with simple RRF (Reciprocal Rank Fusion).
4. Stream answer via Vercel AI SDK with inline `[^note_id]` citations.
5. UI renders citation chips that link to source notes.

### 1.5 Browse / filter notes
1. User opens `/notes`.
2. Sidebar shows `<TaxonomyTree>` — Domain → Sub-Category counts.
3. Main pane lists notes; filters: domain, sub_category, free-text `q` (server-side).
4. Click a note → `/notes/[id]` detail view with edit + re-categorize actions.

### 1.6 Edit / re-categorize a note
1. User opens note detail, clicks **Re-categorize**.
2. Server re-runs `CATEGORIZER_PROMPT` with current heading + body.
3. UI shows old vs. new taxonomy side-by-side; user accepts or keeps original.
4. On accept: update note + log `ingest_log` row with `mode='recategorize'`.

---

## 2. Feature Specifications

### F1 — Ingestion (dual mode)
- **Trigger:** API call or Claude Code skill.
- **Inputs:** `headings: string[]` (and optional `bodies: string[]`).
- **Processing:** parse → for each → categorize → define → embed → insert.
- **Outputs:** array of `Note` rows.
- **Errors:** LLM timeout → retry once with fallback provider; persistent failure → write `ingest_log` row with `status='failed'`, return partial success.

### F2 — Auto-categorization
- **Trigger:** every ingest, plus manual re-categorize.
- **Inputs:** heading, optional body, current user taxonomy snapshot.
- **Processing:** `CATEGORIZER_PROMPT` → strict JSON → `TAXONOMY_NORMALIZER_PROMPT` (only if proposed pair is new) → canonical pair.
- **Outputs:** `{domain, sub_category, confidence, reasoning}`.
- **Errors:** confidence < 0.5 → store with `domain='Uncategorized'` and flag for user review.

### F3 — Definition + example generation
- **Trigger:** every ingest after categorization.
- **Inputs:** heading, categorization, optional body.
- **Processing:** `DEFINER_PROMPT` → strict JSON.
- **Outputs:** `{definition_md, example_md, key_terms}`.
- **Errors:** missing example field → retry once; still missing → store definition only.

### F4 — History & audit log
- **Trigger:** every ingest, edit, re-categorize, or delete.
- **Storage:** `ingest_log` table (see §3).
- **Output:** `/api/log?limit=50` for recent activity panel.

### F5 — Hybrid RAG retrieval + answer
- **Trigger:** `POST /api/rag/query`.
- **Inputs:** `question`, optional `session_id`.
- **Processing:**
  1. Embed query with same model as notes.
  2. FTS: `ts_rank(fts, plainto_tsquery(q))` top 20.
  3. Vector: `embedding <=> query_embedding` top 20.
  4. RRF fuse → top 8.
  5. Stream `RAG_ANSWER_PROMPT` with retrieved chunks.
- **Outputs:** SSE stream of markdown tokens + final `citations[]`.
- **Errors:** K=0 → return canned "no matching notes" message; do not call LLM.

### F6 — Taxonomy normalization
- **Trigger:** after every categorization that proposes a new `(domain, sub_category)` pair.
- **Processing:** lowercase + singular-plural fold + Levenshtein distance ≤ 2 vs. existing taxonomy → if match found, return canonical; else call `TAXONOMY_NORMALIZER_PROMPT` for LLM-judged merge.
- **Outputs:** canonical `(domain, sub_category)`; updates `taxonomy.usage_count`.

---

## 3. Data Schemas

### 3.1 TypeScript types

```ts
// lib/types.ts
export type Note = {
  id: string;                    // uuid
  user_id: string;               // auth.users.id
  heading: string;
  body_md: string | null;
  definition_md: string;
  example_md: string | null;
  domain: string;
  sub_category: string;
  source: 'ui' | 'bulk' | 'cc-session' | 'api';
  created_at: string;            // ISO
  updated_at: string;
  // embedding + fts are server-only; not serialized to client
};

export type TaxonomyEntry = {
  id: string;
  user_id: string;
  domain: string;
  sub_category: string;
  alias_of: string | null;       // points to canonical TaxonomyEntry.id if alias
  usage_count: number;
};

export type IngestLog = {
  id: string;
  user_id: string;
  mode: 'ui' | 'bulk' | 'cc-session' | 'api' | 'recategorize';
  model: string;                 // e.g. 'claude-sonnet-4-6', 'gpt-4o'
  raw_input: string;
  parsed_count: number;
  status: 'success' | 'partial' | 'failed';
  error: string | null;
  created_at: string;
};

export type ChatSession = {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content_md: string;
  citations: { note_id: string; rank: number }[] | null;
  created_at: string;
};
```

### 3.2 Postgres DDL (abbreviated; full in `migrations/`)

```sql
create extension if not exists vector;
create extension if not exists pg_trgm;

create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  heading text not null,
  body_md text,
  definition_md text not null,
  example_md text,
  domain text not null,
  sub_category text not null,
  source text not null check (source in ('ui','bulk','cc-session','api')),
  embedding vector(1536),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(heading,'') || ' ' || coalesce(definition_md,'') || ' ' || coalesce(body_md,''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_domain_idx on notes(user_id, domain, sub_category);
create index notes_fts_idx on notes using gin(fts);
create index notes_embedding_idx on notes using hnsw (embedding vector_cosine_ops);

create table taxonomy (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  sub_category text not null,
  alias_of uuid references taxonomy(id),
  usage_count int not null default 0,
  unique (user_id, domain, sub_category)
);

create table ingest_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  model text not null,
  raw_input text not null,
  parsed_count int not null default 0,
  status text not null check (status in ('success','partial','failed')),
  error text,
  created_at timestamptz not null default now()
);

create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content_md text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);

-- RLS enabled on every table; policies = (auth.uid() = user_id)
```

---

## 4. API Contracts

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/api/ingest` | `{ headings: string[], bodies?: string[], mode: 'ui'\|'bulk' }` | `{ notes: Note[], log_id: string }` |
| POST | `/api/ingest/single` | `{ heading: string, body?: string }` | `Note` |
| POST | `/api/ingest/cc-session` | `{ items: { heading, domain, sub_category, definition_md, example_md, key_terms[] }[] }` (Bearer: `NOUS_INGEST_TOKEN`) | `{ inserted: number, ids: string[] }` |
| GET | `/api/notes` | query: `domain?`, `sub_category?`, `q?`, `limit?`, `offset?` | `{ notes: Note[], total: number }` |
| GET | `/api/notes/[id]` | — | `Note` |
| PATCH | `/api/notes/[id]` | `Partial<Note>` | `Note` |
| POST | `/api/notes/[id]/recategorize` | — | `{ old: {domain, sub_category}, new: {domain, sub_category} }` |
| GET | `/api/taxonomy` | — | `{ tree: { [domain: string]: { [sub: string]: number } } }` |
| POST | `/api/rag/query` | `{ question: string, session_id?: string }` | SSE stream → `{ answer_md, citations: { note_id, rank }[] }` |
| GET | `/api/log` | query: `limit?` | `IngestLog[]` |

All routes (except `/api/ingest/cc-session`) authenticate via Supabase session cookie. `cc-session` uses bearer `NOUS_INGEST_TOKEN`, server-validated.

---

## 5. LLM Prompt Contracts

All prompts return **strict JSON only** (no prose, no markdown fences). Full prompt text lives in `.claude/CLAUDE.md`. Expected output shapes:

```ts
// CATEGORIZER_PROMPT → 
{ domain: string,            // 1-3 words
  sub_category: string,      // 2-5 words
  confidence: number,        // 0..1
  reasoning: string }        // ≤2 sentences

// DEFINER_PROMPT →
{ definition_md: string,     // ≤120 words, markdown allowed
  example_md: string,        // ```code``` block (technical) OR scenario paragraph (non-technical)
  key_terms: string[] }      // 3-8 entries

// TAXONOMY_NORMALIZER_PROMPT →
{ action: 'reuse' | 'create',
  canonical: { domain: string, sub_category: string },
  reason: string }

// RAG_ANSWER_PROMPT →
// streaming markdown; final message includes citation list parsed from [^id] markers
```

Every prompt invocation is wrapped in `lib/llm/withJsonSchema(prompt, zodSchema)` which retries once on parse failure before falling back to the secondary provider.
