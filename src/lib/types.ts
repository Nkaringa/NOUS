// Core types — mirror docs/SPEC.md §3.1.
// DB rows are the canonical shape. Client-facing types omit server-only fields.

export type NoteSource = "ui" | "bulk" | "cc-session" | "api";
export type IngestMode = NoteSource | "recategorize" | "regenerate";
export type IngestStatus = "success" | "partial" | "failed";
export type WorkspaceRole = "owner" | "member";

export type Note = {
  id: string;
  user_id: string;       // created_by — the actor inside a workspace
  workspace_id: string;  // scoping
  heading: string;
  body_md: string | null;
  definition_md: string;
  example_md: string | null;
  domain: string;
  sub_category: string;
  source: NoteSource;
  confidence: number | null;   // categorizer confidence; null pre-migration
  key_terms: string[] | null;  // definer key terms; null pre-migration
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
  user_id: string;       // actor
  workspace_id: string;
  mode: IngestMode;
  model: string;
  raw_input: string;
  parsed_count: number;
  status: IngestStatus;
  error: string | null;
  note_ids: string[] | null; // notes created by this run; null pre-migration
  created_at: string;
};

export type Workspace = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type WorkspaceMember = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  joined_at: string;
};

export type WorkspaceInvite = {
  id: string;
  workspace_id: string;
  token: string;
  created_by: string;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
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
