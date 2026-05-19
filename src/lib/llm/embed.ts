import { getOpenAI, OPENAI_EMBED_MODEL } from "./openai";

export async function embedText(text: string): Promise<number[]> {
  const client = getOpenAI();
  if (!client) throw new Error("OPENAI_API_KEY not set (required for embeddings)");

  const res = await client.embeddings.create({
    model: OPENAI_EMBED_MODEL,
    input: text,
  });

  const vec = res.data[0]?.embedding;
  if (!vec) throw new Error("OpenAI returned no embedding");
  return vec;
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const client = getOpenAI();
  if (!client) throw new Error("OPENAI_API_KEY not set");
  if (texts.length === 0) return [];

  const res = await client.embeddings.create({
    model: OPENAI_EMBED_MODEL,
    input: texts,
  });

  return res.data.map((d) => d.embedding);
}
