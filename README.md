# NOUS

> Personal learning assistant — categorize, define, recall.

NOUS turns daily learning into a structured, searchable knowledge base. Paste a heading like *"HA VPN with Cloud Router (BGP)"* and it auto-categorizes the topic under a 2-tier taxonomy (Domain → Sub-category), writes a concise definition with a worked example, and stores it. A context-aware chat assistant answers cross-domain questions using your own notes — with inline citations back to the source.

---

## Features

- **Dual ingestion.** Paste headings into the web UI, *or* run the `/nous-ingest` skill from inside Claude Code (categorization and definition happen in your session — no API calls billed).
- **Dynamic 2-tier taxonomy.** No pre-defined buckets. Domain (Technology, Law, Media…) → Sub-category (Cloud Networking, Constitutional Law, Anime Storytelling…). LLM-judged normalization prevents drift.
- **Hybrid RAG.** Postgres full-text search + pgvector embeddings, fused with Reciprocal Rank Fusion. Falls back to general knowledge with a clear banner when no relevant notes exist.
- **Streaming progress.** Bulk ingest streams NDJSON per item — pending → ok / failed dots in real time.
- **Persistent chat history.** Sessions stored in `chat_messages`; sidebar lists past conversations; citations preserved.
- **Live activity log.** Every ingest, recategorize, and CC-session call writes to `ingest_log`; in-progress runs update in real time.

## Stack

- **Frontend + API:** Next.js 15 (App Router), TypeScript strict, Tailwind v4
- **Type:** Source Serif 4 (note bodies) + Inter (UI) + JetBrains Mono (code) via `next/font`
- **DB:** Supabase Postgres with pgvector + row-level security
- **LLM:** Anthropic Claude (primary, via tool-use structured output) + OpenAI (fallback + embeddings via `text-embedding-3-small`)
- **Validation:** Zod at every boundary

---

## Setup

### Prerequisites
- Node 20+
- A free Supabase project
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))
- An OpenAI API key ([platform.openai.com](https://platform.openai.com))

### 1. Install
```bash
git clone <your-fork-url>
cd nous
npm install
```

### 2. Provision Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. Link the CLI and push migrations:
   ```bash
   npx supabase login            # one-time browser auth
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push          # applies 3 migrations
   ```
3. In **Authentication → URL Configuration**, add `http://localhost:3000/**` to **Redirect URLs**.

### 3. Configure env vars
Copy and fill:
```bash
cp .env.local.example .env
```
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

### 4. Run
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000), sign in via magic link, and ingest your first heading.

---

## CC-session skill (optional, recommended)

For ingestion from inside Claude Code with categorization + definition done by Claude in your session (no API calls billed):

```bash
node scripts/setup-cc-session.mjs
```

This generates `NOUS_INGEST_TOKEN`, finds your `NOUS_INGEST_USER_ID` from Supabase Auth, and appends both to `.env`. After restarting `npm run dev`, the `nous-ingest` skill at `.claude/skills/nous-ingest/SKILL.md` is auto-discovered in any Claude Code session opened from this directory.

Usage:
```
/nous-ingest BGP convergence, ACID transactions, Article 21 of Indian Constitution
```
Claude reads the headings, runs the categorizer + definer prompts in-session, and POSTs the structured items to `/api/ingest/cc-session`. Server-side: normalize taxonomy → embed → insert. ~80% cheaper than the web flow per heading.

### Optional: invoke the skill from any directory (targeting PROD)

By default the skill reads its config from the project `.env` and is only auto-discovered when Claude Code is opened in this repo. To use it against your **deployed** instance from any project on your laptop:

1. **Install at user-scope** so it's discoverable everywhere:
   ```bash
   cp -r .claude/skills/nous-ingest ~/.claude/skills/nous-ingest
   ```
2. **Create a user-scope config** pointing at prod:
   ```bash
   mkdir -p ~/.nous && chmod 700 ~/.nous
   cat > ~/.nous/env <<EOF
   NOUS_API_URL=https://<your-deployed-url>
   NOUS_INGEST_TOKEN=<prod bearer token from Vercel env vars>
   EOF
   chmod 600 ~/.nous/env
   ```

The skill's config lookup chain is: `~/.nous/env` (preferred) → project `./.env` → shell env → ask. So local `npm run dev` continues to use the project `.env` (DEV); the skill invoked from elsewhere uses `~/.nous/env` (PROD).

---

## Project structure

```
src/
├── app/
│   ├── api/               Route handlers (ingest, rag, notes, chat, taxonomy)
│   ├── (pages)/           Dashboard, /notes, /chat, /ingest, /activity, /login
│   └── layout.tsx         Root + font wiring
├── components/            React (Server + Client) components
├── lib/
│   ├── llm/               Anthropic + OpenAI adapter with fallback (tool-use)
│   ├── ingest/            Heading parser, taxonomy resolver, per-item pipeline
│   ├── rag/               Hybrid retriever (FTS + pgvector + RRF)
│   ├── supabase/          Browser, server, and middleware clients
│   ├── env.ts             Zod-validated env loader
│   ├── types.ts           Note / TaxonomyEntry / ChatMessage types
│   └── zod-schemas.ts     LLM output + request validators
└── middleware.ts          Cookie-session refresh + redirect

supabase/
└── migrations/            init schema · RAG RPCs · chat_messages.mode

.claude/
├── CLAUDE.md              Dev guide + canonical master prompts
└── skills/nous-ingest/    Claude Code skill spec

docs/
├── IDEA.md                Concept + differentiators
├── SPEC.md                Schemas, API contracts, user flows
├── ARCHITECTURE.md        System design + deployment
└── MVP.md                 v0.1 build plan

scripts/                   One-shot setup utilities
tests/fixtures/            Canonical smoke-test headings
```

---

## Deployment

**Vercel + Supabase** is the path of least resistance 

1. Push to GitHub.
2. Import the repo into Vercel.
3. Set the 5 env vars in **Project Settings → Environment Variables**.
4. In Supabase, add the Vercel URL to **Auth → URL Configuration** redirect allow-list.
5. Apply migrations to your production Supabase (`npx supabase db push --linked` against the prod project).

> **Note on Hobby tier:** Vercel free has a 60 s function timeout. Single-heading ingestion and chat work fine; bulk web ingest of 10+ headings (~150–300 s end-to-end) needs Vercel Pro for `maxDuration: 300` to take effect. The `nous-ingest` CC-session skill avoids this limit entirely (server only does normalize + embed + insert per item; ~20 s for 10 headings).

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture diagram, RLS policies, and ingestion pipeline.

---

## Conventions (if contributing)

- TypeScript strict; Zod at every API + LLM boundary.
- All LLM calls go through `lib/llm/withJsonSchema()` — Anthropic primary via tool-use, OpenAI fallback.
- New tables ship with RLS policies in the same migration.
- Server Components by default; mark `'use client'` only when streaming or state requires it.
- Prompts live in `src/lib/llm/prompts.ts` (canonical) — `CLAUDE.md` Part C mirrors them for human reference.

See [`.claude/CLAUDE.md`](.claude/CLAUDE.md) for the full dev guide.
