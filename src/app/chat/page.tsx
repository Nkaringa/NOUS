import { RAGChat } from "@/components/RAGChat";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspaces/active";

export const dynamic = "force-dynamic";

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const workspaceId = await getActiveWorkspaceId(supabase, user.id);

  let noteCount = 0;
  let chatCount = 0;
  if (workspaceId) {
    const [{ count: nc }, { count: cc }] = await Promise.all([
      supabase
        .from("notes")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
      supabase
        .from("chat_sessions")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId),
    ]);
    noteCount = nc ?? 0;
    chatCount = cc ?? 0;
  }

  return (
    <div>
      <h1>Chat</h1>
      <p className="mt-1 text-[13px] text-ink-mid">
        Ask anything. Answers cite the source notes inline.
      </p>
      <div className="mt-8">
        <RAGChat
          sessionId={null}
          initialMessages={[]}
          noteCount={noteCount}
          chatCount={chatCount}
          initialQuestion={q}
        />
      </div>
    </div>
  );
}
