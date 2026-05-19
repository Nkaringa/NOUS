// POST /api/ingest/single — single-heading ingest.
// Auth: Supabase session cookie.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ingestSingleBody } from "@/lib/zod-schemas";
import { ingestBatch } from "@/lib/ingest/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = ingestSingleBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { results, modelsUsed } = await ingestBatch({
    supabase,
    userId: user.id,
    items: [{ heading: parsed.data.heading, body: parsed.data.body ?? null }],
    source: "ui",
  });

  const first = results[0];
  if (!first || !first.ok) {
    await supabase.from("ingest_log").insert({
      user_id: user.id,
      mode: "ui",
      model: modelsUsed.join(",") || "unknown",
      raw_input: parsed.data.heading,
      parsed_count: 0,
      status: "failed",
      error: first && !first.ok ? first.error : "no result",
    });
    return NextResponse.json(
      { error: first && !first.ok ? first.error : "no result" },
      { status: 500 },
    );
  }

  await supabase.from("ingest_log").insert({
    user_id: user.id,
    mode: "ui",
    model: modelsUsed.join(",") || "unknown",
    raw_input: parsed.data.heading,
    parsed_count: 1,
    status: "success",
  });

  return NextResponse.json(first.note);
}
