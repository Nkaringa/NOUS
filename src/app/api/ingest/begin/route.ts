// POST /api/ingest/begin — start a chunked bulk submission.
// Creates one ingest_log row (status=partial, model=pending, parsed_count=0)
// with the full raw_input recorded up front. Returns { log_id } that the
// client passes to subsequent POST /api/ingest calls for each chunk.
//
// Used by IngestForm when the parsed heading count exceeds the chunk size
// (currently 2), to bypass Vercel Hobby's 60s function timeout by splitting
// one logical submission into N independent function invocations that all
// update the same log row.

import type { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ingestBeginBody } from "@/lib/zod-schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = ingestBeginBody.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { all_headings, mode } = parsed.data;
  const rawInput = all_headings.map((h, i) => `${i + 1}. ${h}`).join("\n");

  const svc = createServiceClient();
  const { data: row, error } = await svc
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

  if (error || !row) {
    return Response.json(
      { error: `failed to create log row: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return Response.json({ log_id: row.id, total: all_headings.length });
}
