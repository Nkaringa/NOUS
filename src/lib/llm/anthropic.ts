import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

export const ANTHROPIC_MODEL = "claude-sonnet-4-6";

/**
 * Structured output via Anthropic tool_use. The model is forced to call the
 * named tool with arguments matching the schema — output is guaranteed JSON
 * matching the shape (no fence parsing, no prose stripping, no retries).
 */
export async function anthropicStructured<T>(args: {
  prompt: string;
  schema: z.ZodSchema<T>;
  toolName: string;
  description?: string;
  maxTokens?: number;
  system?: string;
}): Promise<{ data: T; model: string }> {
  const client = getAnthropic();
  if (!client) throw new Error("ANTHROPIC_API_KEY not set");

  const jsonSchema = zodToJsonSchema(args.schema, { target: "jsonSchema7" });
  // zodToJsonSchema wraps with $schema and $ref under name-based mode; with no
  // name option, it returns the schema directly (correct here).

  const res = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: args.maxTokens ?? 1024,
    system: args.system,
    tools: [
      {
        name: args.toolName,
        description: args.description ?? `Submit a ${args.toolName} result.`,
        // Anthropic accepts JSON Schema as input_schema.
        input_schema: jsonSchema as unknown as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: args.toolName },
    messages: [{ role: "user", content: args.prompt }],
  });

  const toolBlock = res.content.find((c) => c.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Anthropic returned no tool_use block");
  }

  const data = args.schema.parse(toolBlock.input);
  return { data, model: ANTHROPIC_MODEL };
}
