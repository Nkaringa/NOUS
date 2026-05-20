// POST /api/workspaces/active — set the active-workspace cookie.
// Used by the workspace switcher in the nav.

import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { setActiveWorkspaceBody } from "@/lib/zod-schemas";
import { ACTIVE_WS_COOKIE } from "@/lib/workspaces/active";

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
  const parsed = setActiveWorkspaceBody.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  // Verify membership before setting the cookie.
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", parsed.data.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return Response.json(
      { error: "not a member of that workspace" },
      { status: 403 },
    );
  }

  const jar = await cookies();
  jar.set(ACTIVE_WS_COOKIE, parsed.data.workspace_id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  return Response.json({ ok: true, workspace_id: parsed.data.workspace_id });
}
