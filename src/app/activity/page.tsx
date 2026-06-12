// Activity — the daybook. Server side assembles everything the client
// shell needs: day groups with resolved note links, and the capture-streak
// grid. Note resolution: rows with note_ids (post-migration) resolve
// directly; historic rows fall back to heading-matching within the
// workspace.

import { createClient } from "@/lib/supabase/server";
import { AutoRefresh } from "@/components/AutoRefresh";
import { getActiveWorkspaceId } from "@/lib/workspaces/active";
import {
  ActivityDaybook,
  type ActivityDay,
  type ActivityEvent,
  type ActivityResult,
  type StreakData,
} from "@/components/ActivityDaybook";
import type { IngestLog } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RECENT_PARTIAL_WINDOW_MS = 10 * 60 * 1000;
const STREAK_WEEKS = 36;

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const workspaceId = await getActiveWorkspaceId(supabase, user.id);
  if (!workspaceId) return null;

  // Streak window: from the Sunday STREAK_WEEKS-1 weeks back, to today.
  const today = new Date();
  const windowStart = new Date(today);
  windowStart.setDate(today.getDate() - today.getDay() - (STREAK_WEEKS - 1) * 7);
  windowStart.setHours(0, 0, 0, 0);

  const [logRes, streakRes] = await Promise.all([
    supabase
      .from("ingest_log")
      .select("id, user_id, workspace_id, mode, model, raw_input, parsed_count, status, error, note_ids, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("ingest_log")
      .select("created_at, parsed_count")
      .eq("workspace_id", workspaceId)
      .gte("created_at", windowStart.toISOString())
      .limit(2000),
  ]);

  const rows = (logRes.data ?? []) as IngestLog[];
  const hasActive = rows.some((r) => {
    if (r.status !== "partial") return false;
    return Date.now() - new Date(r.created_at).getTime() < RECENT_PARTIAL_WINDOW_MS;
  });

  // ── Resolve notes for every row ─────────────────────────────
  const idSet = new Set<string>();
  const headingSet = new Set<string>();
  const parsedHeadingsByRow = new Map<string, string[]>();

  for (const r of rows) {
    const headings = parseLoggedHeadings(r.raw_input);
    parsedHeadingsByRow.set(r.id, headings);
    if (r.note_ids && r.note_ids.length > 0) {
      r.note_ids.forEach((id) => idSet.add(id));
    } else {
      headings.forEach((h) => headingSet.add(h));
    }
  }

  type NoteLite = {
    id: string;
    heading: string;
    domain: string;
    sub_category: string;
    confidence: number | null;
  };
  const noteById = new Map<string, NoteLite>();
  const noteByHeading = new Map<string, NoteLite>();

  const [byIdRes, byHeadingRes] = await Promise.all([
    idSet.size > 0
      ? supabase
          .from("notes")
          .select("id, heading, domain, sub_category, confidence")
          .in("id", Array.from(idSet))
      : Promise.resolve({ data: [] }),
    headingSet.size > 0
      ? supabase
          .from("notes")
          .select("id, heading, domain, sub_category, confidence")
          .eq("workspace_id", workspaceId)
          .in("heading", Array.from(headingSet))
      : Promise.resolve({ data: [] }),
  ]);
  for (const n of (byIdRes.data ?? []) as NoteLite[]) noteById.set(n.id, n);
  for (const n of (byHeadingRes.data ?? []) as NoteLite[]) {
    noteByHeading.set(n.heading.toLowerCase(), n);
  }

  // ── Build day groups ────────────────────────────────────────
  const dayMap = new Map<string, ActivityDay>();
  for (const r of rows) {
    const d = new Date(r.created_at);
    const key = d.toLocaleDateString("en-CA"); // YYYY-MM-DD, local
    let day = dayMap.get(key);
    if (!day) {
      day = {
        key,
        dayNum: String(d.getDate()),
        monthLabel: `${d.toLocaleDateString(undefined, { weekday: "short" })} · ${d
          .toLocaleDateString(undefined, { month: "short", year: "numeric" })}`
          .toUpperCase(),
        captured: 0,
        regenerated: 0,
        errorCount: 0,
        failedRuns: 0,
        events: [],
      };
      dayMap.set(key, day);
    }

    const isInProgress =
      r.status === "partial" &&
      Date.now() - new Date(r.created_at).getTime() < RECENT_PARTIAL_WINDOW_MS &&
      r.model === "pending";
    const status: ActivityEvent["status"] = isInProgress ? "running" : r.status;

    const errorLines = r.error
      ? r.error.split("\n").map((l) => l.trim()).filter(Boolean)
      : [];

    const headings = parsedHeadingsByRow.get(r.id) ?? [];
    let results: ActivityResult[];
    if (r.note_ids && r.note_ids.length > 0) {
      results = r.note_ids
        .map((id) => noteById.get(id))
        .filter((n): n is NoteLite => !!n)
        .map((n) => ({
          noteId: n.id,
          heading: n.heading,
          domain: n.domain,
          sub_category: n.sub_category,
          confidence: n.confidence,
        }));
    } else {
      results = headings.map((h) => {
        const n = noteByHeading.get(h.toLowerCase());
        return n
          ? {
              noteId: n.id,
              heading: n.heading,
              domain: n.domain,
              sub_category: n.sub_category,
              confidence: n.confidence,
            }
          : { noteId: null, heading: h, domain: null, sub_category: null, confidence: null };
      });
    }

    if (r.mode === "regenerate" || r.mode === "recategorize") {
      day.regenerated += 1;
    } else {
      day.captured += r.parsed_count;
    }
    day.errorCount += errorLines.length;
    if (r.status === "failed") day.failedRuns += 1;

    day.events.push({
      id: r.id,
      time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      mode: r.mode,
      status,
      parsedCount: r.parsed_count,
      inputCount: Math.max(headings.length, r.parsed_count),
      model: isInProgress ? "pending" : r.model,
      rawInput: r.raw_input,
      errorLines,
      results,
    });
  }
  const days = Array.from(dayMap.values());

  // ── Streak ──────────────────────────────────────────────────
  const perDay = new Map<string, number>();
  for (const r of streakRes.data ?? []) {
    const key = new Date(r.created_at as string).toLocaleDateString("en-CA");
    perDay.set(key, (perDay.get(key) ?? 0) + Math.max(1, (r.parsed_count as number) ?? 0));
  }

  const cells: number[] = [];
  const months: StreakData["months"] = [];
  let activeDays = 0;
  let longestStreak = 0;
  let runStreak = 0;
  let prevMonth = -1;
  const todayKey = today.toLocaleDateString("en-CA");

  for (let w = 0; w < STREAK_WEEKS; w++) {
    const weekStart = new Date(windowStart);
    weekStart.setDate(windowStart.getDate() + w * 7);
    if (weekStart.getMonth() !== prevMonth) {
      prevMonth = weekStart.getMonth();
      months.push({
        week: w,
        label: weekStart.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
      });
    }
    for (let dd = 0; dd < 7; dd++) {
      const date = new Date(windowStart);
      date.setDate(windowStart.getDate() + w * 7 + dd);
      const key = date.toLocaleDateString("en-CA");
      if (key > todayKey) {
        cells.push(-1);
        continue;
      }
      const count = perDay.get(key) ?? 0;
      if (count > 0) {
        activeDays++;
        runStreak++;
        longestStreak = Math.max(longestStreak, runStreak);
      } else {
        runStreak = 0;
      }
      cells.push(count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 6 ? 3 : 4);
    }
  }

  const streak: StreakData = {
    cells,
    weeks: STREAK_WEEKS,
    months,
    activeDays,
    longestStreak,
  };

  return (
    <main className="mx-auto max-w-[1060px] px-9 pb-[90px] pt-11">
      <AutoRefresh active={hasActive} />
      <ActivityDaybook days={days} streak={streak} />
    </main>
  );
}

// raw_input is written in several shapes across the ingest routes:
//   single / recategorize / regenerate → the bare heading
//   bulk / begin                       → "1. heading" per line, or "# heading\nbody"
//   cc-session                         → JSON array of headings
function parseLoggedHeadings(raw: string | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) {
        return arr.map((s) => s.trim()).filter(Boolean);
      }
    } catch {
      // fall through
    }
  }

  const lines = trimmed.split("\n");
  const numbered: string[] = [];
  const markdown: string[] = [];
  for (const line of lines) {
    const l = line.trim();
    const numMatch = l.match(/^\d+\.\s+(.+)$/);
    if (numMatch) numbered.push(numMatch[1]!.trim());
    const mdMatch = l.match(/^#+\s+(.+)$/);
    if (mdMatch) markdown.push(mdMatch[1]!.trim());
  }
  if (numbered.length > 0) return numbered;
  if (markdown.length > 0) return markdown;

  if (lines.length === 1 && trimmed.length <= 200) return [trimmed];
  return [];
}
