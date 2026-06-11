import { z } from "zod";

// LLM output validators — used by the withJsonSchema wrapper in lib/llm.

export const categorizerSchema = z.object({
  domain: z.string().min(1).max(40),
  sub_category: z.string().min(1).max(60),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1).max(500),
});

export const definerSchema = z.object({
  definition_md: z.string().min(10).max(2000),
  example_md: z.string().min(1).max(4000),
  key_terms: z.array(z.string().min(1).max(60)).min(1).max(12),
});

export const taxonomyNormalizerSchema = z.object({
  action: z.enum(["reuse", "create"]),
  canonical: z.object({
    domain: z.string().min(1).max(40),
    sub_category: z.string().min(1).max(60),
  }),
  reason: z.string().min(1).max(300),
});

// API request validators.

// workspace_id is optional in cookie-authed routes (falls back to active
// workspace from cookie); required in the cc-session route (no cookie
// available — caller must specify which workspace to write to).
export const ingestBulkBody = z.object({
  headings: z.array(z.string().min(1)).min(1).max(50),
  bodies: z.array(z.string()).optional(),
  mode: z.enum(["ui", "bulk"]).default("bulk"),
  workspace_id: z.string().uuid().optional(),
  log_id: z.string().uuid().optional(),
  is_last_chunk: z.boolean().optional().default(true),
});

export const ingestBeginBody = z.object({
  all_headings: z.array(z.string().min(1)).min(1).max(200),
  mode: z.enum(["ui", "bulk"]).default("bulk"),
  workspace_id: z.string().uuid().optional(),
});

export const ingestSingleBody = z.object({
  heading: z.string().min(1).max(500),
  body: z.string().max(20_000).optional(),
  workspace_id: z.string().uuid().optional(),
  // When true, skip the near-duplicate pre-check and insert even if a
  // similar note already exists in the workspace. Set by the UI after the
  // user dismisses the duplicate warning modal.
  force: z.boolean().optional().default(false),
});

export const ccSessionItem = z.object({
  heading: z.string().min(1).max(500),
  body_md: z.string().max(20_000).nullish(),
  domain: z.string().min(1).max(40),
  sub_category: z.string().min(1).max(60),
  definition_md: z.string().min(10).max(2000),
  example_md: z.string().min(1).max(4000),
  key_terms: z.array(z.string()).min(1).max(12),
  confidence: z.number().min(0).max(1).default(1),
});

export const ccSessionBody = z.object({
  workspace_id: z.string().uuid(),
  items: z.array(ccSessionItem).min(1).max(100),
});

// Workspace management endpoints

export const createWorkspaceBody = z.object({
  name: z.string().min(1).max(80),
});

export const renameWorkspaceBody = z.object({
  name: z.string().min(1).max(80),
});

export const createInviteBody = z.object({
  expires_in_days: z.number().int().positive().max(365).optional(),
  max_uses: z.number().int().positive().max(100).optional(),
});

export const setActiveWorkspaceBody = z.object({
  workspace_id: z.string().uuid(),
});

export const ragQueryBody = z.object({
  question: z.string().min(1).max(2000),
  session_id: z.string().uuid().optional(),
  workspace_id: z.string().uuid().optional(),
});
