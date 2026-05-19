"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refresh the current Server Component tree every `intervalMs`.
 * Pass `active=false` to pause (e.g. when no in-progress rows exist).
 */
export function AutoRefresh({
  intervalMs = 4000,
  active = true,
}: {
  intervalMs?: number;
  active?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, active]);
  return null;
}
