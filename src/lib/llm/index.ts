import { z } from "zod";
import { anthropicStructured } from "./anthropic";
import { openaiStructured } from "./openai";

export { embedText, embedBatch } from "./embed";
export { ANTHROPIC_MODEL } from "./anthropic";
export { OPENAI_MODEL, OPENAI_EMBED_MODEL } from "./openai";

/**
 * Run a JSON-output prompt with provider fallback + schema validation.
 *
 *   Anthropic (primary, tool_use forces structured output)
 *   → OpenAI  (fallback, json_object mode + Zod parse)
 *
 * `toolName` is required for the Anthropic tool_use path; pick something
 * descriptive like "submit_categorization".
 *
 * Returns { data, model }. Throws if both providers fail.
 */
export async function withJsonSchema<T>(args: {
  prompt: string;
  schema: z.ZodSchema<T>;
  toolName: string;
  description?: string;
  maxTokens?: number;
  system?: string;
}): Promise<{ data: T; model: string }> {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error(
      "No LLM provider configured: set ANTHROPIC_API_KEY and/or OPENAI_API_KEY in .env, then restart the dev server.",
    );
  }

  const errors: string[] = [];

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await anthropicStructured({
        prompt: args.prompt,
        schema: args.schema,
        toolName: args.toolName,
        description: args.description,
        maxTokens: args.maxTokens,
        system: args.system,
      });
    } catch (err) {
      errors.push(`anthropic: ${(err as Error).message}`);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      return await openaiStructured({
        prompt: args.prompt,
        schema: args.schema,
        maxTokens: args.maxTokens,
        system: args.system,
      });
    } catch (err) {
      errors.push(`openai: ${(err as Error).message}`);
    }
  }

  throw new Error(`All LLM providers failed:\n${errors.join("\n")}`);
}
