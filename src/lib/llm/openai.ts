import OpenAI from "openai";
import { z } from "zod";

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export const OPENAI_MODEL = "gpt-4o-mini";
export const OPENAI_EMBED_MODEL = "text-embedding-3-small";

/**
 * Structured output via OpenAI's json_object response_format. The model is
 * guaranteed to output a valid JSON object — no need for fence stripping.
 * (Strict json_schema mode requires schema massaging; json_object + Zod
 * validation is sufficient for our schemas.)
 */
export async function openaiStructured<T>(args: {
  prompt: string;
  schema: z.ZodSchema<T>;
  maxTokens?: number;
  system?: string;
}): Promise<{ data: T; model: string }> {
  const client = getOpenAI();
  if (!client) throw new Error("OPENAI_API_KEY not set");

  const res = await client.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: args.maxTokens ?? 1024,
    response_format: { type: "json_object" },
    messages: [
      ...(args.system ? [{ role: "system" as const, content: args.system }] : []),
      { role: "user", content: args.prompt },
    ],
  });

  const text = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text);
  const data = args.schema.parse(parsed);
  return { data, model: OPENAI_MODEL };
}
