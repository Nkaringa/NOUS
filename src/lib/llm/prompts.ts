// Canonical master prompts — runtime source of truth.
// Mirrored in .claude/CLAUDE.md Part C for human reference.
// Bumping any prompt: increment its version + update tests/prompts/<name>.expected.json.

import type { TaxonomySnapshot } from "@/lib/types";

export const PROMPT_VERSIONS = {
  categorizer: "v1.0",
  definer: "v1.1",
  taxonomy_normalizer: "v1.0",
  rag_answer: "v1.0",
} as const;

export function categorizerPrompt(args: {
  heading: string;
  body?: string | null;
  taxonomy: TaxonomySnapshot;
}): string {
  const taxonomyJson = JSON.stringify(args.taxonomy, null, 2);
  return `You are a taxonomy classifier for a personal learning system. Classify the
following heading under a 2-tier taxonomy: Domain (broad field) and
Sub-Category (specific area within the domain).

EXISTING TAXONOMY (prefer reusing these):
${taxonomyJson}

HEADING: ${args.heading}
OPTIONAL BODY: ${args.body ?? "(none)"}

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
}`;
}

export function definerPrompt(args: {
  heading: string;
  domain: string;
  sub_category: string;
  body?: string | null;
}): string {
  return `You are writing a teaching-quality micro-note for a personal learning system.

HEADING: ${args.heading}
DOMAIN: ${args.domain}
SUB_CATEGORY: ${args.sub_category}
OPTIONAL BODY: ${args.body ?? "(none)"}

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
   inside a \`\`\`language fenced block, ≤25 lines, copy-paste ready.
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
  "example_md": "string — for TECHNICAL topics MUST contain a \`\`\` fenced code block",
  "key_terms": ["string", ...]
}`;
}

/**
 * Follow-up prompt sent when the first definer call returned a technical
 * note without a code fence. We quote back the rejected output so the
 * model can see exactly what failed.
 */
export function definerRetryPrompt(args: {
  heading: string;
  domain: string;
  sub_category: string;
  body?: string | null;
  rejected_example_md: string;
}): string {
  return `You previously wrote a micro-note for the following heading but the
example_md field was REJECTED because the topic is technical and the
example does not contain a \`\`\` fenced code block.

HEADING: ${args.heading}
DOMAIN: ${args.domain}
SUB_CATEGORY: ${args.sub_category}
OPTIONAL BODY: ${args.body ?? "(none)"}

REJECTED example_md:
"""
${args.rejected_example_md}
"""

Produce the note again. The example_md MUST be a runnable code or config
snippet inside a \`\`\`language fenced block, ≤25 lines. Pick the language
idiomatic to the topic. Definition rules unchanged: ≤120 words, lead with
the meaning.

Output STRICT JSON only:

{
  "definition_md": "string (markdown)",
  "example_md": "string — MUST contain a \`\`\` fenced code block",
  "key_terms": ["string", ...]
}`;
}

/**
 * Domains the categorizer settles on for technical topics. Used to decide
 * whether to enforce the code-fence rule. Keep aligned with the list in
 * definerPrompt's body so prompt + post-check agree.
 */
export const TECHNICAL_DOMAINS = new Set([
  "technology",
  "engineering",
  "software",
  "networking",
  "cloud",
  "data",
  "security",
  "devops",
  "programming",
  "ai",
  "ml",
  "computer science",
]);

export function isTechnicalDomain(domain: string): boolean {
  return TECHNICAL_DOMAINS.has(domain.trim().toLowerCase());
}

export function hasCodeFence(text: string): boolean {
  return /```[\s\S]*?```/.test(text);
}

export function taxonomyNormalizerPrompt(args: {
  proposed: { domain: string; sub_category: string };
  taxonomy: TaxonomySnapshot;
}): string {
  return `You are preventing taxonomy drift in a personal knowledge base.

PROPOSED PAIR: ${JSON.stringify(args.proposed)}

EXISTING TAXONOMY (with usage counts):
${JSON.stringify(args.taxonomy, null, 2)}

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
}`;
}

export function ragAnswerNoNotesSystemPrompt(): string {
  return `You are a learning assistant. The user's personal note collection has
NO notes matching their current question, so you must answer from general
knowledge alone.

Rules:
- Answer concisely and accurately from general knowledge.
- Do NOT add citation markers like [^id] — there are no notes to cite.
- End with a single short suggestion (1-2 sentences) of what kind of note
  the user could add to their collection so future questions on this topic
  can pull from their own notes. Phrase it as a friendly nudge, not a
  warning.
- Format: concise markdown. Use bullets for enumerable items, prose for
  explanations.`;
}

export function ragAnswerSystemPrompt(): string {
  return `You are a research assistant answering a question using ONLY the user's
personal notes provided below. Each note has an ID, heading, domain,
sub-category, definition, and example.

Citation rules:
- Cite a note the FIRST time you reference its content, using [^<note_id>].
  Do NOT re-cite the same note for adjacent sentences from the same source.
- If multiple notes support a single claim, cite each one once at that claim.
- Cite only when introducing material from a note — not for summary
  sentences or transitions.

Content rules:
- If the notes don't contain enough information to answer, say so plainly
  and suggest what kind of note would help. Do NOT invent facts.
- Prefer cross-domain synthesis where the question allows it — connect ideas
  across domains and call out the connection explicitly.
- Format: concise markdown. Use bullets for enumerable items, prose for
  explanations. No "Footnotes" section — the client renders citations
  inline.`;
}
