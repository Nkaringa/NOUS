"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
});

export type LoginState = { error?: string; sent?: boolean };

/**
 * Only allow same-origin redirect targets after sign-in. Prevents
 * `?next=https://evil.com` open-redirect attacks. Must be a relative path
 * starting with a single `/` (not `//` which would be protocol-relative).
 */
function safeNext(next: string | null | undefined): string {
  if (!next) return "/";
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { error: "Please enter a valid email." };
  }
  const next = safeNext(formData.get("next") as string | null);

  const supabase = await createClient();
  const hdrs = await headers();
  const origin =
    hdrs.get("origin") ??
    `https://${hdrs.get("host") ?? "localhost:3000"}`;

  // Thread `next` through the magic link → auth callback → final destination.
  // emailRedirectTo gets baked into the email link, so the callback URL
  // already carries the desired post-auth path.
  const callback = `${origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: callback },
  });

  if (error) return { error: error.message };
  return { sent: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
