// Active workspace resolution + lazy "Personal" workspace bootstrap.
//
// Every API call + Server Component that operates on scoped data needs to
// know which workspace it's in. The active workspace is stored in a cookie
// (`nous_active_ws`) set by the workspace switcher. If the cookie is
// missing or points at a workspace the user is no longer a member of, we
// fall back to the user's oldest owned workspace.
//
// For brand-new users (signed up AFTER the initial schema migration), the
// fallback chain finds nothing — so we lazy-create a "Personal" workspace
// on the first request and return its id. This makes signup +
// workspace-creation a single transparent step.

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/server";

export const ACTIVE_WS_COOKIE = "nous_active_ws";

export async function getActiveWorkspaceId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const jar = await cookies();
  const cookieWs = jar.get(ACTIVE_WS_COOKIE)?.value;

  if (cookieWs) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", cookieWs)
      .eq("user_id", userId)
      .maybeSingle();
    if (membership) return membership.workspace_id;
  }

  const { data: owned } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (owned) return owned.id;

  const { data: anyMembership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (anyMembership) return anyMembership.workspace_id;

  // No workspaces at all — must be a new user. Lazy-create their Personal
  // workspace so the rest of the request can proceed.
  return await ensurePersonalWorkspace(userId);
}

export async function resolveWorkspaceId(args: {
  supabase: SupabaseClient;
  userId: string;
  explicit?: string | null;
}): Promise<string | null> {
  const { supabase, userId, explicit } = args;

  if (explicit) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", explicit)
      .eq("user_id", userId)
      .maybeSingle();
    if (membership) return membership.workspace_id;
    return null;
  }

  return getActiveWorkspaceId(supabase, userId);
}

/**
 * Create a "Personal" workspace + owner membership for a user who has none.
 * Uses service-role because the user isn't a member of anything yet
 * (chicken-and-egg for the workspace_members insert under RLS).
 *
 * Idempotent at the workspaces-table level via the "owned" check — if a
 * Personal already exists (race condition between two parallel requests),
 * we just return the existing one.
 */
async function ensurePersonalWorkspace(userId: string): Promise<string | null> {
  const svc = createServiceClient();

  // Recheck via service-role in case cookie-client missed something
  const { data: existingOwned } = await svc
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingOwned) {
    // Ensure member row exists too (defensive)
    await svc
      .from("workspace_members")
      .upsert(
        { workspace_id: existingOwned.id, user_id: userId, role: "owner" },
        { onConflict: "workspace_id,user_id" },
      );
    return existingOwned.id;
  }

  const { data: ws, error: wsErr } = await svc
    .from("workspaces")
    .insert({ name: "Personal", owner_id: userId })
    .select("id")
    .single();
  if (wsErr || !ws) return null;

  const { error: memErr } = await svc.from("workspace_members").insert({
    workspace_id: ws.id,
    user_id: userId,
    role: "owner",
  });
  if (memErr) {
    // Roll back the workspace to avoid orphan
    await svc.from("workspaces").delete().eq("id", ws.id);
    return null;
  }

  return ws.id;
}
