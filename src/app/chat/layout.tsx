import { createClient } from "@/lib/supabase/server";
import { ChatSidebar, type ChatSessionListItem } from "@/components/ChatSidebar";

export const dynamic = "force-dynamic";

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("chat_sessions")
    .select("id, title, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  const sessions = (data ?? []) as ChatSessionListItem[];

  return (
    <div className="mx-auto max-w-[1100px] px-8 py-8">
      <div className="grid gap-8 md:grid-cols-[240px_1fr]">
        <ChatSidebar sessions={sessions} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
