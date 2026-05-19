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

export const ingestBulkBody = z.object({
  headings: z.array(z.string().min(1)).min(1).max(50),
  bodies: z.array(z.string()).optional(),
  mode: z.enum(["ui", "bulk"]).default("bulk"),
  // Chunked-submission support. If provided, reuse the existing ingest_log
  // row instead of creating a new one. Client-side chunking uses this to
  // make N independent requests appear as one submission in /activity.
  log_id: z.string().uuid().optional(),
  is_last_chunk: z.boolean().optional().default(true),
});

export const ingestBeginBody = z.object({
  all_headings: z.array(z.string().min(1)).min(1).max(200),
  mode: z.enum(["ui", "bulk"]).default("bulk"),
});

export const ingestSingleBody = z.object({
  heading: z.string().min(1).max(500),
  body: z.string().max(20_000).optional(),
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
  items: z.array(ccSessionItem).min(1).max(100),
});
