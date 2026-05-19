// Core types — mirror docs/SPEC.md §3.1.
// DB rows are the canonical shape. Client-facing types omit server-only fields.

export type NoteSource = "ui" | "bulk" | "cc-session" | "api";
export type IngestMode = NoteSource | "recategorize";
export type IngestStatus = "success" | "partial" | "failed";

export type Note = {
  id: string;
  user_id: string;
  heading: string;
  body_md: string | null;
  definition_md: string;
  example_md: string | null;
  domain: string;
  sub_category: string;
  source: NoteSource;
  created_at: string;
  updated_at: string;
};

export type TaxonomyEntry = {
  id: string;
  user_id: string;
  domain: string;
  sub_category: string;
  alias_of: string | null;
  usage_count: number;
};

export type TaxonomySnapshot = Array<{
  domain: string;
  sub_category: string;
  usage_count: number;
}>;

export type IngestLog = {
  id: string;
  user_id: string;
  mode: IngestMode;
  model: string;
  raw_input: string;
  parsed_count: number;
  status: IngestStatus;
  error: string | null;
  created_at: string;
};

// LLM output contracts (validated with Zod in zod-schemas.ts).
export type CategorizerOutput = {
  domain: string;
  sub_category: string;
  confidence: number;
  reasoning: string;
};

export type DefinerOutput = {
  definition_md: string;
  example_md: string;
  key_terms: string[];
};

export type TaxonomyNormalizerOutput = {
  action: "reuse" | "create";
  canonical: { domain: string; sub_category: string };
  reason: string;
};
