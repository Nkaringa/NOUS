---
name: nous-ingest
description: Ingest learning headings into NOUS — Claude (in-session) categorizes each under a 2-tier taxonomy, generates a definition + code/example, and either POSTs to the NOUS backend or stages results to a local JSON file when offline. Use when the user pastes raw headings, references a notes file, or says "ingest these notes / add to NOUS".
---

# nous-ingest

You are operating as the **NOUS ingestion engine** in Claude Code session mode. The user maintains a personal learning system (see `~/Desktop/NOUS/docs/IDEA.md`); your job is to convert raw learning input into categorized, defined notes ready for storage.

## When to use this skill

Invoke this skill when the user:
- Pastes one or more learning headings/topics
- References a file like `Notes.docx`, `notes-raw.md`, `headings.txt`
- Says any variant of: *"ingest these"*, *"add to NOUS"*, *"categorize these notes"*, *"process my learnings"*

## Inputs you accept

| Input form | Example | Action |
|---|---|---|
| Inline headings (lines) | `HA Proxy\nBGP\nArticle 21` | Treat each non-empty line as one heading |
| Markdown with `#`/`##` | `# Topic\nbody...\n# Topic2` | Each header = heading; following text = body |
| Single heading | `BGP convergence` | Single-note ingest |
| File path | `data/notes-raw.md` | Read file, then parse using rules below |
| Free-form blob (the user's Notes.docx style) | mixed topics + code + lists | Apply the **Heuristic Parser** below |

## Heuristic Parser (for free-form input like the user's Notes.docx)

The user's source notes mix headings, code snippets, lists, and explanations without consistent structure. Parse with these rules in order:

1. **Topic-like lines** become heading candidates. A topic-like line:
   - Starts with a noun phrase ≤ 80 chars
   - Often ends with ` –`, `:`, or is a comma-separated list of terms (e.g., *"HA Proxy, HA VPN, Cloud Router (BGP), VPC peering"*)
   - Frequently begins with capitalized acronyms or proper nouns
2. **Continuation lines** (until the next heading candidate) become the `body` of that heading. Code blocks, lists, and explanatory prose all qualify.
3. **Comma-separated heading lists** (e.g., *"RDBMS, NoSQL, Icebergs, Parquets"*) — ask the user once: split into one note per item, or treat as a single "Data storage formats overview" note? Default to **split** if the items are all clearly distinct concepts.
4. **Code-only paragraphs with no preceding heading** — attach to the most recent heading as body content.
5. **Skip:** lines that are pure punctuation, single-character lines, or obviously stray fragments (`X`, `Y`, `{}`, etc.).

When in doubt, show the user the proposed heading list and ask for confirmation **once** before generating definitions.

## Processing pipeline (per heading)

For each parsed heading, you (Claude) execute these prompts in-session — **no API calls**.

### Step 1 — Categorize

Apply `CATEGORIZER_PROMPT` from `.claude/CLAUDE.md` Part C. You will need the current user taxonomy snapshot. Fetch it via:

```http
GET {NOUS_API_URL}/api/taxonomy
Authorization: Bearer {NOUS_INGEST_TOKEN}
```

If the API is unreachable, use an empty taxonomy `{}` — the server will normalize on insert.

Produce strict JSON:
```json
{ "domain": "string (1-3 words)",
  "sub_category": "string (2-5 words)",
  "confidence": 0.0-1.0,
  "reasoning": "≤2 sentences" }
```

If `confidence < 0.5`, set `domain = "Uncategorized"` and flag for user review at the end.

### Step 2 — Define + exemplify

Apply `DEFINER_PROMPT` from `.claude/CLAUDE.md` Part C. Produce:
```json
{ "definition_md": "≤120 words, markdown",
  "example_md": "code block (technical) OR scenario (non-technical)",
  "key_terms": ["3-8 items"] }
```

**Quality rules:**
- Technical topics (anything tagged Domain = `Technology`, `Engineering`, `Software`, `Cloud`, `Networking`, etc.) MUST get a runnable code snippet in a fenced code block ≤ 25 lines.
- Non-technical topics get a concrete real-world scenario (1–3 sentences, not abstract description).
- Definitions lead with the meaning. No "this concept refers to" filler.

### Step 3 — Assemble payload

Build the per-item object:
```json
{ "heading": "verbatim user input or parsed heading",
  "body_md": "original body text or null",
  "domain": "...",
  "sub_category": "...",
  "definition_md": "...",
  "example_md": "...",
  "key_terms": [...],
  "confidence": 0.85 }
```

## Output paths

Decide based on environment:

### Path A — Backend reachable (preferred)

```http
POST {NOUS_API_URL}/api/ingest/cc-session
Authorization: Bearer {NOUS_INGEST_TOKEN}
Content-Type: application/json

{ "items": [ ...assembled items... ] }
```

Required env vars (read from `~/Desktop/NOUS/.env.local` if present, else ask user once and offer to save):
- `NOUS_API_URL` (e.g., `http://localhost:3000` for local dev, or the Vercel URL)
- `NOUS_INGEST_TOKEN` (server-issued bearer token)

Server response: `{ inserted: number, ids: string[], taxonomy_changes: [...] }`.

### Path B — Backend not running (staging mode)

Write to `~/Desktop/NOUS/data/staging/ingest-{ISO_TIMESTAMP}.json` with the same `{ items: [...] }` shape. Report:

> Backend unreachable. Staged N items to `data/staging/ingest-2026-05-19T12-30-00.json`. Run `npm run dev` (or set `NOUS_API_URL`), then re-invoke `/nous-ingest` with this file to flush.

### Path C — Backend reachable but auth fails (401/403)

Stop. Tell the user to check `NOUS_INGEST_TOKEN`. Do not retry blindly.

## Reporting back to the user

After processing, always print a summary block:

```
NOUS ingest summary
───────────────────
Source: <file path or 'inline'>
Parsed: N headings
Inserted: M  |  Staged: K  |  Failed: F
Taxonomy: new pairs created → [Domain/Sub, ...]
Flagged for review (confidence < 0.5):
  - "<heading>" → Uncategorized
View notes: <NOUS_API_URL>/notes
```

For batches > 5 items, show a one-line preview per item:
```
✓ "HA VPN with Cloud Router (BGP)"  →  Technology / Cloud Networking  (0.92)
✓ "Article 21"                       →  Law / Constitutional Law      (0.88)
⚠ "X"                                →  Uncategorized                  (0.31)
```

## Pre-flight checks (run before any LLM work)

1. Confirm `~/Desktop/NOUS/.claude/CLAUDE.md` exists and read Part C prompts — they are the canonical source.
2. Confirm taxonomy fetch (Path A) or note that you're in staging mode (Path B).
3. If parsing > 20 items, ask the user to confirm before proceeding — token cost and time scale linearly.

## What this skill does NOT do

- Does not generate embeddings (Claude can't produce vectors — the server handles that on insert).
- Does not modify existing notes (use the `/api/notes/[id]` PATCH endpoint manually for edits).
- Does not handle URL/article scraping (deferred to v0.2+ per `docs/MVP.md`).
- Does not run the RAG assistant (separate `/chat` UI).

## Failure modes & recovery

| Failure | Recovery |
|---|---|
| Network timeout on POST | Write to staging path, report to user |
| LLM JSON parse error (your own output) | Retry the prompt once with stricter formatting instructions, then fall back to Uncategorized + raw heading-only note |
| Heading too vague to categorize confidently | Store as Uncategorized, flag in summary |
| Duplicate heading already in DB (server returns 409) | Skip silently, report in summary as "deduped: N" |
| User aborts mid-batch | Save processed items to staging, report partial progress |

## Example invocations

```
/nous-ingest data/notes-raw.md
/nous-ingest
   HA Proxy
   BGP convergence
   Article 21 of Indian Constitution
/nous-ingest "Narrative pacing in Frieren"
```
