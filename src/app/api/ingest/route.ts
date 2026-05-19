// POST /api/ingest — bulk ingestion with NDJSON streaming + live ingest_log.
// Auth: Supabase session cookie.
//
// Supports chunked submission via optional `log_id` + `is_last_chunk`:
//   - First call without log_id: creates a new ingest_log row (legacy behavior).
//   - Subsequent calls with log_id: reuse that row, accumulate parsed_count
//     and errors. Final status only set when `is_last_chunk` is true.
//
// Stream events (NDJSON):
//   {"type":"start","total":N,"parsed":[...],"log_id":"..."}
//   {"type":"item","index":i,"total":N,"ok":true,"note":{...}}
//   {"type":"item","index":i,"total":N,"ok":false,"heading":"...","error":"..."}
//   {"type":"done","succeeded":S,"failed":F,"status":"...","log_id":"..."}

import type { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ingestBulkBody } from "@/lib/zod-schemas";
import { parseHeadings } from "@/lib/ingest/parse";
import { ingestBatch } from "@/lib/ingest/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let items: Array<{ heading: string; body: string | null }>;
  let mode: "ui" | "bulk" = "bulk";
  let logId: string | null = null;
  let isLastChunk = true;

  if (typeof (body as { text?: unknown }).text === "string") {
    items = parseHeadings((body as { text: string }).text);
    mode = "bulk";
  } else {
    const parsed = ingestBulkBody.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "validation", details: parsed.error.flatten() }),
        { status: 422, headers: { "Content-Type": "application/json" } },
      );
    }
    items = parsed.data.headings.map((heading, i) => ({
      heading,
      body: parsed.data.bodies?.[i] ?? null,
    }));
    mode = parsed.data.mode;
    logId = parsed.data.log_id ?? null;
    isLastChunk = parsed.data.is_last_chunk ?? true;
  }

  if (items.length === 0) {
    return new Response(JSON.stringify({ error: "no headings parsed" }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  const svc = createServiceClient();

  // Resolve the log row: reuse if log_id provided & matches user; else create new.
  let cumulativeStart = 0;
  let existingErrorBlock = "";
  if (logId) {
    const { data: existing } = await svc
      .from("ingest_log")
      .select("user_id, parsed_count, error")
      .eq("id", logId)
      .maybeSingle();
    if (!existing || existing.user_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "invalid log_id" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }
    cumulativeStart = existing.parsed_count ?? 0;
    existingErrorBlock = existing.error ?? "";
  } else {
    const rawInput = items
      .map((it, i) => (it.body ? `# ${it.heading}\n${it.body}` : `${i + 1}. ${it.heading}`))
      .join("\n");
    const { data: newRow } = await svc
      .from("ingest_log")
      .insert({
        user_id: user.id,
        mode,
        model: "pending",
        raw_input: rawInput,
        parsed_count: 0,
        status: "partial",
      })
      .select("id")
      .single();
    logId = newRow?.id ?? null;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      try {
        emit({
          type: "start",
          total: items.length,
          parsed: items.map((it) => it.heading),
          log_id: logId,
        });

        let chunkSucceeded = 0;
        const newErrorLines: string[] = [];

        const { results, modelsUsed } = await ingestBatch({
          supabase,
          userId: user.id,
          items,
          source: mode,
          onProgress: async ({ index, total, result }) => {
            if (result.ok) {
              chunkSucceeded++;
              emit({ type: "item", index, total, ok: true, note: result.note });
            } else {
              newErrorLines.push(`${result.heading}: ${result.error}`);
              emit({
                type: "item",
                index,
                total,
                ok: false,
                heading: result.heading,
                error: result.error,
              });
            }
            if (logId) {
              const combinedErr = [existingErrorBlock, newErrorLines.join("\n")]
                .filter(Boolean)
                .join("\n");
              await svc
                .from("ingest_log")
                .update({
                  parsed_count: cumulativeStart + chunkSucceeded,
                  error: combinedErr || null,
                })
                .eq("id", logId);
            }
          },
        });

        const totalSucceededSoFar = cumulativeStart + chunkSucceeded;
        const chunkFailed = results.length - chunkSucceeded;
        const combinedErr = [existingErrorBlock, newErrorLines.join("\n")]
          .filter(Boolean)
          .join("\n");
        const totalErrorCount = combinedErr ? combinedErr.split("\n").filter(Boolean).length : 0;
        const finalStatus =
          totalErrorCount === 0
            ? "success"
            : totalSucceededSoFar > 0
              ? "partial"
              : "failed";

        if (logId) {
          // Only set the final status on the last chunk; intermediate chunks
          // leave the row as 'partial' so /activity reflects in-progress.
          const updatePayload: Record<string, unknown> = {
            parsed_count: totalSucceededSoFar,
            error: combinedErr || null,
          };
          if (isLastChunk) {
            updatePayload.status = finalStatus;
            updatePayload.model = modelsUsed.join(",") || "unknown";
          }
          await svc.from("ingest_log").update(updatePayload).eq("id", logId);
        }

        emit({
          type: "done",
          succeeded: chunkSucceeded,
          failed: chunkFailed,
          status: isLastChunk ? finalStatus : "partial",
          log_id: logId,
        });
      } catch (err) {
        const msg = (err as Error).message;
        if (logId && isLastChunk) {
          await svc
            .from("ingest_log")
            .update({ status: "failed", error: msg, model: "error" })
            .eq("id", logId);
        }
        controller.enqueue(
          encoder.encode(JSON.stringify({ type: "fatal", error: msg }) + "\n"),
        );
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
