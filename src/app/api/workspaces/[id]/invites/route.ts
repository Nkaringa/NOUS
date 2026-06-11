// POST /api/workspaces/[id]/invites — generate a new invite link (owner only)
// GET  /api/workspaces/[id]/invites — list active invites (owner only)

import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createInviteBody } from "@/lib/zod-schemas";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // RLS: invites_select policy = owner only.
  const { data, error } = await supabase
    .from("workspace_invites")
    .select("id, token, expires_at, max_uses, used_count, created_at")
    .eq("workspace_id", id)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ invites: data ?? [] });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // empty body is OK — both fields are optional
  }
  const parsed = createInviteBody.safeParse(body ?? {});
  if (!parsed.success) {
    return Response.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const token = randomBytes(24).toString("base64url"); // ~32 chars URL-safe
  const expiresAt = parsed.data.expires_in_days
    ? new Date(Date.now() + parsed.data.expires_in_days * 86_400_000).toISOString()
    : null;

  // RLS: invites_insert policy = owner only.
  const { data, error } = await supabase
    .from("workspace_invites")
    .insert({
      workspace_id: id,
      token,
      created_by: user.id,
      expires_at: expiresAt,
      max_uses: parsed.data.max_uses ?? null,
    })
    .select("id, token, expires_at, max_uses, used_count, created_at")
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "not owner of workspace" }, { status: 403 });

  return Response.json({ invite: data });
}
