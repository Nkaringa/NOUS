# NOUS — Claude Development Guide & Master Prompts

This file serves two purposes:
1. **Instructions for Claude Code** when assisting development of this repo.
2. **Canonical master prompts** used at runtime by the ingestion + RAG pipelines.

Both are versioned together — changing a prompt = bumping its `vX.Y` tag.

---

## Part A — How Claude Should Help in This Repo

### Stack conventions
- **TypeScript strict mode** everywhere; no `any` without a `// reason:` comment.
- **Zod at every boundary** — API request/response, LLM JSON output, env-var loading.
- **Server Components by default**; only mark `'use client'` when streaming or state is required (`<IngestForm>`, `<RAGChat>`).
- **No direct SDK calls in route handlers** — every LLM call goes through `lib/llm/` adapter (Anthropic primary, OpenAI fallback, retry-with-schema wrapper).
- **No direct DB writes from client** — all writes via API routes with server-side Supabase client.

### Vendor & dependency rules
- Don't introduce a new third-party vendor (auth provider, vector DB, observability) without an ADR in `docs/adr/`.
- Prefer Vercel AI SDK over raw provider SDKs for any new LLM feature — keeps streaming + provider-swap behavior consistent.
- Avoid `langchain` / `llamaindex` for retrieval — hand-rolled hybrid retriever is < 100 LOC and easier to debug.

### Database rules
- **RLS-first:** any new table ships with RLS policies in the same migration file. No exceptions.
- **Cascade on user delete** for every user-scoped FK.
- **One migration per change** — never edit a committed migration; add a new one.

### Testing
- Categorizer + Definer prompts have eval fixtures in `tests/prompts/`. Run before bumping any prompt version.
- The 10-heading fixture at `tests/fixtures/sample-headings.md` is the canonical smoke test for the ingestion pipeline.
- E2E flows (login → ingest → chat) use Playwright against a local Supabase via `supabase start`.

### When the user asks for a new feature
- Check `docs/MVP.md` — if it's "Out of Scope (v0.2+)", confirm with the user before implementing.
- Check `docs/SPEC.md` — if the feature already has a contract, follow it exactly. If not, propose the schema/contract first.

---

## Part B — Claude Code Ingest Skill Specification

Path: `.claude/skills/nous-ingest/SKILL.md`

### Skill behavior

When the user invokes `/nous-ingest` (with or without arguments):

1. **Gather input:**
   - If args contain a file path → read the file.
   - If args contain raw text → use as input.
   - If no args → ask user to paste headings.
2. **Parse headings:**
   - Markdown `#` / `##` headers, OR
   - Non-empty lines (one heading per line).
3. **For each heading** (Claude executes in-session, no API call):
   - Apply `CATEGORIZER_PROMPT` → produce `{domain, sub_category, confidence, reasoning}`.
   - Apply `DEFINER_PROMPT` → produce `{definition_md, example_md, key_terms}`.
4. **POST to ingest endpoint:**
   ```http
   POST https://<deployment>/api/ingest/cc-session
   Authorization: Bearer <NOUS_INGEST_TOKEN from env>
   Content-Type: application/json

   { "items": [
       { "heading": "...", "domain": "...", "sub_category": "...",
         "definition_md": "...", "example_md": "...", "key_terms": [...] }
     ] }
   ```
5. **Report back:** `{inserted, ids[]}` → tell user "Ingested N notes. View at /notes".

### Skill error handling
- Network failure → save items as JSON to `~/.nous/pending-ingest-<timestamp>.json`, instruct user to retry.
- Auth failure (401) → tell user to check `NOUS_INGEST_TOKEN`.
- Validation failure (422) → display server error, do not retry blindly.

---

## Part C — Master Prompts (Canonical, Version-Pinned)

### `CATEGORIZER_PROMPT` v1.0

```
You are a taxonomy classifier for a personal learning system. Classify the
following heading under a 2-tier taxonomy: Domain (broad field) and
Sub-Category (specific area within the domain).

EXISTING TAXONOMY (prefer reusing these):
{taxonomy_snapshot_json}

HEADING: {heading}
OPTIONAL BODY: {body}

Rules:
- Domain: 1-3 words (e.g., "Technology", "Law", "Media").
- Sub-Category: 2-5 words (e.g., "Cloud Networking", "Constitutional Law").
- Strongly prefer reusing an existing (Domain, Sub-Category) pair. Only
  propose a new pair if no existing match is a reasonable fit.
- If the heading is too vague to classify, set domain="Uncategorized",
  sub_category="Uncategorized", confidence < 0.5.

Output STRICT JSON only, no prose, no markdown fences:

{
  "domain": "string",
  "sub_category": "string",
  "confidence": 0.0-1.0,
  "reasoning": "one or two sentences"
}
```

### `DEFINER_PROMPT` v1.1

Changes from v1.0: tighter technical-vs-non-technical decision rule (explicit
domain list), explicit "code fence required for technical topics, prose
example is a rejection". Backed by a one-shot retry in
`src/lib/ingest/pipeline.ts` that re-prompts when a technical note returns
without a fence.

```
You are writing a teaching-quality micro-note for a personal learning system.

HEADING: {heading}
DOMAIN: {domain}
SUB_CATEGORY: {sub_category}
OPTIONAL BODY: {body}

Produce:

1. A concise definition (≤120 words, markdown allowed). Lead with the
   meaning. No "this concept refers to" / "X is a term used for" filler.

2. ONE example. The format depends on whether the topic is TECHNICAL or
   NON-TECHNICAL:

   TECHNICAL — anything with an executable / machine-checkable representation:
   code, algorithms, data structures, APIs, protocols, queries, configuration,
   commands, tools, languages, frameworks, infrastructure, network setups.
   When DOMAIN is one of Technology, Engineering, Software, Networking,
   Cloud, Data, Security, DevOps, Programming, AI, ML, Computer Science —
   treat as TECHNICAL.

   For TECHNICAL topics the example MUST be a runnable code/config snippet
   inside a ```language fenced block, ≤25 lines, copy-paste ready.
   Pick the language idiomatic to the topic (python, ts, sql, bash,
   yaml, go, ...). A prose example here is a rejection — re-do as code.

   NON-TECHNICAL — law, history, philosophy, business, media, art, social:
   a concrete real-world scenario (1-3 sentences) that shows the concept
   in action. No code fence.

3. 3-8 key terms a reader should know to fully understand this note.

Output STRICT JSON only — no prose before or after, no markdown fences
wrapping the JSON object itself:

{
  "definition_md": "string (markdown)",
  "example_md": "string — for TECHNICAL topics MUST contain a ``` fenced code block",
  "key_terms": ["string", ...]
}
```

### `TAXONOMY_NORMALIZER_PROMPT` v1.0

```
You are preventing taxonomy drift in a personal knowledge base.

PROPOSED PAIR: { "domain": "{proposed_domain}", "sub_category": "{proposed_sub}" }

EXISTING TAXONOMY (with usage counts):
{taxonomy_with_counts_json}

Decide:
- If an existing pair means substantively the same thing (e.g., "Cloud Infra"
  vs "Cloud Infrastructure"), choose action="reuse" and return the canonical
  existing pair.
- If the proposed pair is genuinely new, choose action="create" and return
  the proposed pair as canonical.
- Prefer reuse. A near-synonym should reuse, not create.

Output STRICT JSON only:

{
  "action": "reuse" | "create",
  "canonical": { "domain": "string", "sub_category": "string" },
  "reason": "one sentence"
}
```

### `RAG_ANSWER_PROMPT` v1.0

```
You are a research assistant answering a question using ONLY the user's
personal notes provided below. Each note has an ID, heading, domain,
sub-category, definition, and example.

NOTES:
{retrieved_notes_with_ids}

QUESTION: {question}

Rules:
- Ground every claim in a specific note. Cite by appending [^<note_id>]
  immediately after each claim (e.g., "BGP converges via path-vector
  exchanges [^a1b2c3]").
- If multiple notes support a claim, cite all of them.
- If the notes don't contain enough information to answer, say so plainly
  and suggest what kind of note would help. Do NOT invent facts.
- Prefer cross-domain synthesis where the question allows it — connect ideas
  across domains and call out the connection explicitly.
- Format: concise markdown. Use bullets for enumerable items, prose for
  explanations.

Begin your answer:
```

---

## Part D — Prompt Versioning

- Each prompt is tagged `vX.Y` in its header.
- Bumping version requires:
  1. Update fixture outputs in `tests/prompts/<prompt-name>.expected.json`.
  2. Run `npm run test:prompts` and verify pass rate ≥ 95% on the fixture set.
  3. Commit prompt + fixture changes in the same commit.
- The runtime adapter `lib/llm/prompts.ts` reads prompts from this file at build time; no DB-stored prompts.

---

## Part E — Quick Reference for Claude Code Sessions

When the user says... | Do this...
---|---
"ingest these headings: ..." | Run `nous-ingest` skill flow (Part B).
"add a new note about X" | Single-heading variant of the skill.
"what does my note on Y say?" | Read via `GET /api/notes?q=Y`, summarize.
"add a feature for Z" | Check `docs/MVP.md` scope first; propose ADR if new vendor needed.
"the categorizer mis-tagged X" | Add to `tests/prompts/categorizer.fixtures.json`, propose prompt fix, bump to v1.1.
