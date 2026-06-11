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

## Resolving target workspace (do this BEFORE step 1 categorize)

NOUS now scopes every note to a workspace. The cc-session route REQUIRES `workspace_id` in the request body. To pick the right one:

1. **Fetch available workspaces** for the cc-session user:
   ```http
   GET {NOUS_API_URL}/api/workspaces
   Authorization: Bearer {NOUS_INGEST_TOKEN}
   ```
   Returns `{ workspaces: [{ id, name, role, member_count, ... }] }`.

2. **Decide which workspace** the user means, in this priority:
   - **Natural-language mention** in the user's invocation. Match patterns like *"ingest X into tech bros"*, *"add Y to the anime club workspace"*, *"... in personal"*. Case-insensitive, substring-match against `name`. If unambiguous → use it.
   - **Single workspace** — if the user has only one workspace, use it silently (no prompt). Most users start here with just "Personal".
   - **Multiple workspaces, no mention** — prompt the user with a numbered list:
     > Which workspace?
     >   1. Personal (just you, 13 notes)
     >   2. Tech Bros (3 members, 47 notes)
     >   3. Anime Club (2 members, 8 notes)
   - User responds with number or name → use that.

3. **Carry `workspace_id`** through the rest of the pipeline (taxonomy fetch + insert). Each note ingested in this batch goes to the same workspace — no per-item workspace selection.

## Fetching the taxonomy snapshot (workspace-scoped)

After resolving workspace, fetch its taxonomy for the categorizer to use:

```http
GET {NOUS_API_URL}/api/taxonomy?workspace_id={WORKSPACE_ID}
Authorization: Bearer {NOUS_INGEST_TOKEN}
```

Returns `{ tree, flat }`. Use `flat` as the categorizer's "EXISTING TAXONOMY" snapshot. If the call fails or returns empty, pass `{}` — the server will normalize on insert.

## Output paths

Decide based on environment:

### Path A — Backend reachable (preferred)

```http
POST {NOUS_API_URL}/api/ingest/cc-session
Authorization: Bearer {NOUS_INGEST_TOKEN}
Content-Type: application/json

{
  "workspace_id": "{resolved workspace id}",
  "items": [ ...assembled items... ]
}
```

### Resolving `NOUS_API_URL` + `NOUS_INGEST_TOKEN`

Look these up **in this priority order**, taking the first one that has the variable defined:

1. **`~/.nous/.env`** — user-scope config. **Preferred when targeting PROD from any directory.**
2. **`./.env`** (the project `.env` in the current working directory) — typical for **local DEV** when the session is opened inside the NOUS repo.
3. **Shell environment** — if the user has already `export`ed them in the current shell.
4. **Ask the user** — if none of the above resolve. Offer to persist what they provide to `~/.nous/.env`.

Expected `~/.nous/.env` format (chmod 600):
```
NOUS_API_URL=https://nous.karinga.dev
NOUS_INGEST_TOKEN=<64-hex prod token>
```

**Critical:** The DEV token will fail against PROD (and vice versa). Always confirm with the user which environment they're targeting before posting, especially if `~/.nous/.env` is present (likely PROD) but they invoked the skill from the project directory (likely meaning DEV).

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

1. **Resolve config** — walk the `~/.nous/.env` → `./.env` → shell env → ask chain (see *Path A* above). Confirm `NOUS_API_URL` + `NOUS_INGEST_TOKEN` are both set before continuing.
2. **Confirm target environment** with the user when ambiguous — e.g., if `~/.nous/.env` points to PROD but `./.env` also exists pointing to DEV. A one-line "ingesting to PROD (`https://nous.karinga.dev`) — confirm?" is enough.
3. **Resolve target workspace** (see *Resolving target workspace* above) — fetch list, detect mention or prompt. The workspace_id is now REQUIRED in the cc-session POST body.
3. **Read prompts** — if a project `.claude/CLAUDE.md` exists in the CWD, read Part C for the canonical CATEGORIZER and DEFINER prompts. If not (skill invoked outside the repo), the prompts below in this file's *Processing pipeline* section describe the contract; follow those.
4. **Fetch taxonomy** via `GET {NOUS_API_URL}/api/taxonomy` to seed the categorizer. Empty `{}` is fine if the call fails.
5. **Confirm batch size** — if parsing > 20 items, ask the user to confirm before proceeding. Token cost and wall time scale linearly.

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
/nous-ingest BGP convergence, ACID transactions into tech bros
/nous-ingest "Luffy's Gear 5" in anime club
```

The last two forms show natural-language workspace mention — the skill matches the workspace name from input and uses it without prompting.
