# NOUS — Personal Learning Assistant

> *Greek: "nous" (νοῦς) — mind, intellect, the faculty that perceives.*

## Problem

You learn something new every day — HA VPN with Cloud Router (BGP), a clause from the Indian Evidence Act, a narrative beat in *Frieren*, a Fed rate decision. The headings pile up in scratch files, Notion pages, and Obsidian vaults. A week later you can't find the BGP note, can't remember why it mattered, and can't ask "wait, how is BGP convergence like consensus protocols I read about?"

The bottleneck isn't capture. It's **categorization, definition, and recall** — and doing all three for free-form input across arbitrary domains.

## Concept

Paste a heading. NOUS does the rest:

1. **Categorizes** it dynamically under a 2-tier taxonomy (Domain → Sub-Category) — no pre-defined buckets, no manual tagging.
2. **Generates** a concise definition (≤120 words) plus a contextual example — a runnable code snippet for technical topics, a real-world scenario for everything else.
3. **Stores & logs** every note with full audit history.
4. **Answers questions** via a context-aware RAG assistant that cites your own notes across domains.

Two ways in, same brain:
- **Claude Code session mode** — when you're already in a Claude Code session, Claude (in-session) does the categorization and definition work, then writes results to your DB.
- **API mode** — paste into the web UI; the server calls Anthropic (primary) with OpenAI fallback.

## Value Proposition

- **Zero categorization friction** — you never pick a folder, never tag, never decide if "Cloud Networking" is a Domain or a Sub-Category. The system proposes and normalizes.
- **Every note is teaching-quality** — definition + worked example, not a bare heading.
- **Cross-domain retrieval** — ask "what's the analogue of BGP convergence in distributed consensus?" and get an answer citing both your networking and CS notes.
- **Your data, your DB** — Supabase Postgres, RLS-isolated, exportable as Markdown any time.

## Main Features (MVP)

1. Dual-mode ingestion (single heading, bulk paste, Claude Code skill)
2. Dynamic 2-tier auto-taxonomy with drift prevention
3. Definition + code/example generation
4. History & audit log for every ingest run
5. Hybrid RAG chat (Postgres FTS + pgvector) with inline citations

## Differentiators

- **Dynamic taxonomy** instead of fixed enums — your structure grows with your interests.
- **Dual ingestion paths** — leverage your Claude Code subscription when you're at the terminal; fall back to APIs when you're on your phone.
- **Cross-domain RAG** built on a hybrid retriever — semantic + keyword, fused.
- **SaaS-ready architecture from day one** — single-user-friendly, but multi-tenant the moment you invite a friend.

## Out of Scope (MVP)

Deferred to v0.2+ once the core loop is rock-solid:

- Spaced repetition & active recall quiz generation
- Web/article scraping utilities
- Interactive 2D/3D knowledge graphs
- Mobile-native UI
- OAuth providers beyond email magic link
