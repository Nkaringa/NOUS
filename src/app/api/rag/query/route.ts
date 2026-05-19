// POST /api/rag/query — hybrid RAG answer with streaming citations and
// chat session persistence.
//
// Body: { question: string, session_id?: string }
// Auth: Supabase session cookie.
//
// Stream events (NDJSON):
//   {"type":"session","session_id":"...","new":true|false}
//   {"type":"notes","notes":[{id,heading,domain,sub_category},...]}
//   {"type":"delta","text":"..."}     (many)
//   {"type":"done","message_id":"..."}
//   {"type":"error","error":"..."}    (terminal on failure)

import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hybridSearch, filterRelevantNotes } from "@/lib/rag/retrieve";
import {
  ragAnswerSystemPrompt,
  ragAnswerNoNotesSystemPrompt,
} from "@/lib/llm/prompts";
import { getAnthropic, ANTHROPIC_MODEL } from "@/lib/llm/anthropic";
import { getOpenAI, OPENAI_MODEL } from "@/lib/llm/openai";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { question?: string; session_id?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  const question = (body.question ?? "").trim();
  if (!question) {
    return Response.json({ error: "no question" }, { status: 422 });
  }
  const requestedSessionId = body.session_id ?? null;

  // --- Session resolution ---
  let sessionId = requestedSessionId;
  let isNewSession = false;
  if (sessionId) {
    const { data: existing } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();
    if (!existing) sessionId = null;
  }
  if (!sessionId) {
    const title =
      question.length > 80 ? question.slice(0, 77) + "..." : question;
    const { data: newSession, error } = await supabase
      .from("chat_sessions")
      .insert({ user_id: user.id, title })
      .select("id")
      .single();
    if (error || !newSession) {
      return Response.json(
        { error: `failed to create session: ${error?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    sessionId = newSession.id;
    isNewSession = true;
  }

  // --- Persist the user's message immediately ---
  await supabase.from("chat_messages").insert({
    session_id: sessionId,
    role: "user",
    content_md: question,
  });

  // --- Hybrid retrieve top 8, then filter per-note for relevance ---
  // The retriever always returns up to K candidates by RRF score, but many
  // may have weak/no signal individually. We filter so the displayed sources
  // and the LLM context only include notes that actually pass a relevance
  // bar (FTS keyword match OR vec similarity >= threshold).
  const retrieved = await hybridSearch({ supabase, query: question, k: 8 });
  const relevantNotes = filterRelevantNotes(retrieved);
  const relevant = relevantNotes.length > 0;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        emit({ type: "session", session_id: sessionId, new: isNewSession });

        // Display only the notes that passed per-note relevance filtering,
        // not the full top-K from the retriever. This matches what the LLM
        // actually sees in its context.
        const citedNotes = relevantNotes.map((n) => ({
          id: n.id,
          heading: n.heading,
          domain: n.domain,
          sub_category: n.sub_category,
        }));
        emit({ type: "notes", notes: citedNotes });

        const mode: "no_notes" | null = relevant ? null : "no_notes";
        if (mode) emit({ type: "mode", mode });

        let assistantText = "";

        if (!relevant) {
          // No matching notes — answer from general knowledge.
          await streamAnswer({
            system: ragAnswerNoNotesSystemPrompt(),
            user: question,
            onDelta: (text) => {
              assistantText += text;
              emit({ type: "delta", text });
            },
          });
        } else {
          const context = relevantNotes
            .map(
              (n, i) =>
                `[${i + 1}] note_id: ${n.id}\nHeading: ${n.heading}\nDomain: ${n.domain} / ${n.sub_category}\nDefinition: ${n.definition_md}\nExample: ${n.example_md ?? "(none)"}`,
            )
            .join("\n\n---\n\n");

          const userPrompt = `NOTES:\n${context}\n\nQUESTION: ${question}\n\nAnswer using ONLY the notes above. Cite using the full note_id, e.g. [^${relevantNotes[0]?.id}]. Begin your answer now:`;

          await streamAnswer({
            system: ragAnswerSystemPrompt(),
            user: userPrompt,
            onDelta: (text) => {
              assistantText += text;
              emit({ type: "delta", text });
            },
          });
        }

        // Persist the assistant's complete message + citations + mode.
        const { data: msgRow } = await supabase
          .from("chat_messages")
          .insert({
            session_id: sessionId,
            role: "assistant",
            content_md: assistantText,
            citations: citedNotes,
            mode,
          })
          .select("id")
          .single();

        emit({ type: "done", message_id: msgRow?.id ?? null });
      } catch (err) {
        emit({ type: "error", error: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

async function streamAnswer(args: {
  system: string;
  user: string;
  onDelta: (text: string) => void;
}): Promise<void> {
  const anthropic = getAnthropic();
  if (anthropic) {
    try {
      const stream = anthropic.messages.stream({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
        system: args.system,
        messages: [{ role: "user", content: args.user }],
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          args.onDelta(event.delta.text);
        }
      }
      return;
    } catch (err) {
      args.onDelta(
        `\n\n_(Anthropic failed: ${(err as Error).message}. Falling back to OpenAI.)_\n\n`,
      );
    }
  }

  const openai = getOpenAI();
  if (!openai) {
    throw new Error("No LLM provider configured");
  }

  const stream = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: 1500,
    stream: true,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  });

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) args.onDelta(text);
  }
}
