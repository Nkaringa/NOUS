// POST /api/ingest/begin — start a chunked bulk submission.
// Creates one ingest_log row scoped to the active workspace; returns the
// log_id which subsequent /api/ingest chunks share via the `log_id` body
// param.

import type { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ingestBeginBody } from "@/lib/zod-schemas";
import { resolveWorkspaceId } from "@/lib/workspaces/active";

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

  const workspaceId = await resolveWorkspaceId({
    supabase,
    userId: user.id,
    explicit: parsed.data.workspace_id ?? null,
  });
  if (!workspaceId) {
    return Response.json({ error: "no workspace available" }, { status: 403 });
  }

  const { all_headings, mode } = parsed.data;
  const rawInput = all_headings.map((h, i) => `${i + 1}. ${h}`).join("\n");

  const svc = createServiceClient();
  const { data: row, error } = await svc
    .from("ingest_log")
    .insert({
      user_id: user.id,
      workspace_id: workspaceId,
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

  return Response.json({
    log_id: row.id,
    total: all_headings.length,
    workspace_id: workspaceId,
  });
}
