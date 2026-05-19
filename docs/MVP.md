# NOUS — MVP Plan

What ships first. Everything else is post-MVP.

---

## MVP Definition

A single authenticated user can:

1. Paste a batch of mixed-domain headings into `/ingest`.
2. See each one categorized (Domain + Sub-Category), defined (≤120 words), and exemplified (code or scenario) within 30 seconds.
3. Browse all notes in `/notes`, grouped by taxonomy.
4. Ask a question in `/chat` and get a streamed answer with at least one citation linking back to a stored note.
5. Run the same ingestion from inside a Claude Code session via the `nous-ingest` skill.

Multi-user infrastructure (Supabase Auth + RLS) is in place from day one, but the MVP target is a single live account.

---

## In-Scope Checklist (v0.1)

1. ✅ Supabase project provisioned; `vector` and `pg_trgm` extensions enabled.
2. ✅ Migration files for `notes`, `taxonomy`, `ingest_log`, `chat_sessions`, `chat_messages` with RLS policies.
3. ✅ Next.js 15 scaffold; `@supabase/ssr` integrated; magic-link login at `/login`.
4. ✅ `/ingest` UI: textarea (single + bulk tabs); submits to `/api/ingest`.
5. ✅ `/api/ingest` route: Anthropic categorize+define → OpenAI fallback → OpenAI embed → Supabase insert.
6. ✅ `/notes` UI: `<TaxonomyTree>` sidebar + filterable list; server-side `q` search.
7. ✅ `/notes/[id]` detail with edit + re-categorize.
8. ✅ `/chat` UI: streaming RAG via Vercel AI SDK; citations rendered as hoverable chips.
9. ✅ Hybrid retriever: FTS (top-20) + pgvector (top-20) → RRF → top-8.
10. ✅ Taxonomy normalizer: trgm fuzzy match first; LLM fallback only when needed.
11. ✅ Claude Code skill `.claude/skills/nous-ingest/SKILL.md` that POSTs to `/api/ingest/cc-session`.
12. ✅ Seed fixture `tests/fixtures/sample-headings.md` with 10 mixed-domain entries.

---

## Out of Scope (deferred to v0.2+)

- Spaced repetition & quiz generation
- Web/article scraping & URL ingest
- Client-side instant substring filter (server `q` ships in MVP)
- Interactive 2D/3D knowledge graphs
- OAuth providers beyond magic link
- Mobile-optimized layouts
- Multi-language UI
- Note export beyond raw JSON

---

## Build Order (Phases)

Each phase is a discrete `gsd-plan-phase` candidate. Estimated cumulative time: 4–6 focused days.

| # | Phase | Output | Gate to next |
|---|---|---|---|
| P1 | DB schema + RLS migrations | `supabase/migrations/*.sql` applied, RLS verified with `SELECT` as anon user | All tables visible only to owning user |
| P2 | Next.js scaffold + Supabase Auth | Magic-link login works; `/` shows authed dashboard | Can log in and see empty state |
| P3 | Ingestion API + master prompts | `/api/ingest/single` + `/api/ingest` working with fixture | 10 fixture headings ingest successfully |
| P4 | Ingestion UI + Notes browse | `/ingest`, `/notes`, `/notes/[id]` complete | User can paste, see results, browse |
| P5 | Hybrid RAG + chat UI | `/api/rag/query` streams; `/chat` renders citations | Cross-domain question returns cited answer |
| P6 | Claude Code ingest skill | `.claude/skills/nous-ingest/` complete; tested end-to-end | Skill ingests 5 headings in CC session |

---

## Success Criteria

Measurable acceptance at v0.1 launch:

- **Ingestion:** paste 10 mixed-domain headings → 10 rows in `notes` table within 30 seconds, ≥ 9 with confidence ≥ 0.7.
- **Taxonomy quality:** no more than 1 "Uncategorized" out of 10 reasonable headings.
- **RAG retrieval:** ask one cross-domain question (e.g., "what concepts in my notes relate to consensus?") → answer cites ≥ 1 note from ≥ 2 different domains.
- **Latency:** `/api/rag/query` first token < 2s; full answer < 10s for K=8.
- **Cost ceiling:** ingestion of 10 headings < $0.05 in API costs (Anthropic + embeddings).
- **CC-session parity:** `nous-ingest` skill produces rows indistinguishable from API-mode ingest of the same headings (same schema, same taxonomy normalization).

---

## Non-Goals for MVP

- Beautiful design — functional shadcn defaults are fine.
- Real-time collaboration — single user only.
- Mobile UI — desktop browser only.
- Offline mode — requires network.
- Bulk export tooling — `pg_dump` is acceptable for v0.1.
