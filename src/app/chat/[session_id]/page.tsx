import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RAGChat, type ChatMessage } from "@/components/RAGChat";

export const dynamic = "force-dynamic";

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ session_id: string }>;
}) {
  const { session_id } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("chat_sessions")
    .select("id, title")
    .eq("id", session_id)
    .maybeSingle();

  if (!session) notFound();

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, role, content_md, citations, mode, created_at")
    .eq("session_id", session_id)
    .order("created_at", { ascending: true });

  const initial: ChatMessage[] = (messages ?? []).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content_md,
    notes: Array.isArray(m.citations) ? m.citations : undefined,
    mode: (m.mode as "no_notes" | null | undefined) ?? null,
  }));

  return (
    <div>
      <h1 className="truncate" title={session.title}>
        {session.title}
      </h1>
      <p className="mt-1 text-[13px] text-ink-mid">
        Continue the conversation — all messages are saved.
      </p>
      <div className="mt-8">
        <RAGChat sessionId={session.id} initialMessages={initial} />
      </div>
    </div>
  );
}
