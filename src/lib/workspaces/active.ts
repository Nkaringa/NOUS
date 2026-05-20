// Active workspace resolution.
//
// Every API call + Server Component that operates on scoped data needs to
// know which workspace it's in. The active workspace is stored in a cookie
// (`nous_active_ws`) set by the workspace switcher. If the cookie is
// missing or points at a workspace the user is no longer a member of, we
// fall back to the user's oldest owned workspace (their "Personal").

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ACTIVE_WS_COOKIE = "nous_active_ws";

/**
 * Resolve the active workspace id for the given (authenticated) user.
 *
 * Returns null only if the user has no workspaces at all — which shouldn't
 * happen post-migration (every user has a Personal workspace).
 */
export async function getActiveWorkspaceId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const jar = await cookies();
  const cookieWs = jar.get(ACTIVE_WS_COOKIE)?.value;

  // If the cookie is set, verify the user still has membership.
  if (cookieWs) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", cookieWs)
      .eq("user_id", userId)
      .maybeSingle();
    if (membership) return membership.workspace_id;
  }

  // Fall back to user's oldest owned workspace (their Personal by default).
  const { data: owned } = await supabase
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (owned) return owned.id;

  // Last resort: any workspace they're a member of.
  const { data: anyMembership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return anyMembership?.workspace_id ?? null;
}

/**
 * Resolve the active workspace from either:
 *   - explicit `workspace_id` in the request (URL query or JSON body), validated for membership
 *   - the active-workspace cookie
 *   - user's default (Personal)
 *
 * Use this in API route handlers that may receive an explicit override.
 */
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
    // Explicit but not a member — fail loudly upstream; don't silently fallback.
    return null;
  }

  return getActiveWorkspaceId(supabase, userId);
}
