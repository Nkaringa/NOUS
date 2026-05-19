import { RAGChat } from "@/components/RAGChat";

export const dynamic = "force-dynamic";

export default function NewChatPage() {
  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-tight">Chat</h1>
      <p className="mt-1 text-[13px] text-ink-mid">
        Ask anything. Answers cite the source notes inline.
      </p>
      <div className="mt-8">
        <RAGChat sessionId={null} initialMessages={[]} />
      </div>
    </div>
  );
}
