"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Markdown } from "./Markdown";
import { cn } from "@/lib/utils";

export type CitedNote = {
  id: string;
  heading: string;
  domain: string;
  sub_category: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  notes?: CitedNote[];
  mode?: "no_notes" | null;
  pending?: boolean;
};

const SAMPLE_QUESTIONS = [
  "What concepts in my notes relate to consensus?",
  "Summarize what I know about cloud networking.",
  "How is BGP convergence related to database transactions?",
];

export function RAGChat({
  sessionId: initialSessionId,
  initialMessages,
  noteCount,
  chatCount,
  initialQuestion,
}: {
  sessionId: string | null;
  initialMessages: ChatMessage[];
  noteCount?: number;
  chatCount?: number;
  initialQuestion?: string;
}) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Auto-send a question passed via ?q= (from the dashboard capture bar).
  // Fires once; the ref guards against React strict-mode double-invoke.
  useEffect(() => {
    if (initialQuestion && !autoSentRef.current) {
      autoSentRef.current = true;
      void send(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  async function send(explicitQuestion?: string) {
    const question = (explicitQuestion ?? input).trim();
    if (!question || running) return;

    setInput("");
    setRunning(true);
    setMessages((m) => [
      ...m,
      { role: "user", content: question },
      { role: "assistant", content: "", pending: true },
    ]);

    try {
      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          ...(sessionId ? { session_id: sessionId } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let answerText = "";
      let cited: CitedNote[] = [];
      let receivedNewSessionId: string | null = null;

      const updateLast = (patch: Partial<ChatMessage>) => {
        setMessages((m) => {
          const last = m[m.length - 1];
          if (!last || last.role !== "assistant") return m;
          return [...m.slice(0, -1), { ...last, ...patch }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: Record<string, unknown>;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }

          if (evt.type === "session") {
            const id = evt.session_id as string;
            if (evt.new && !sessionId) {
              receivedNewSessionId = id;
              setSessionId(id);
            }
          } else if (evt.type === "notes") {
            cited = evt.notes as CitedNote[];
            updateLast({ notes: cited });
          } else if (evt.type === "mode") {
            updateLast({ mode: evt.mode as "no_notes" | null });
          } else if (evt.type === "delta") {
            answerText += evt.text as string;
            updateLast({ content: answerText, pending: true });
          } else if (evt.type === "done") {
            updateLast({ content: answerText, notes: cited, pending: false });
          } else if (evt.type === "error") {
            throw new Error(evt.error as string);
          }
        }
      }

      if (receivedNewSessionId) {
        router.replace(`/chat/${receivedNewSessionId}`);
        router.refresh();
      }
    } catch (e) {
      const msg = (e as Error).message;
      setMessages((m) => {
        const last = m[m.length - 1];
        if (last?.role === "assistant") {
          return [
            ...m.slice(0, -1),
            { role: "assistant", content: `**Error:** ${msg}`, pending: false },
          ];
        }
        return m;
      });
    } finally {
      setRunning(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-220px)] flex-col">
      <div
        ref={scrollerRef}
        className="flex-1 space-y-6 overflow-y-auto pb-6 pr-2"
      >
        {isEmpty && (
          <EmptyState noteCount={noteCount} chatCount={chatCount} />
        )}
        {messages.map((m, i) => (
          <MessageBlock key={i} message={m} />
        ))}
      </div>

      <div className="border-t border-hairline pt-4">
        {isEmpty && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setInput(q)}
                disabled={running}
                className="rounded-full border border-hairline px-3 py-1 text-[12px] text-ink-mid transition-colors hover:border-hairline-strong hover:bg-bg-soft hover:text-ink disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Ask anything about your notes…"
          disabled={running}
          className="w-full resize-none rounded border border-hairline-strong bg-bg-input px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-soft focus:border-ink disabled:opacity-50"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-ink-soft">
            ↵ send · ⇧↵ newline
          </span>
          <button
            type="button"
            onClick={() => send()}
            disabled={running || !input.trim()}
            className="rounded bg-red px-4 py-1.5 text-[13px] font-medium text-white hover:bg-red-deep disabled:opacity-50"
          >
            {running ? "Thinking…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  noteCount,
  chatCount,
}: {
  noteCount?: number;
  chatCount?: number;
}) {
  const hasStats = noteCount !== undefined || chatCount !== undefined;
  return (
    <div className="mt-12">
      {hasStats && (
        <div className="flex gap-6 border-b border-hairline pb-5 text-[12px] text-ink-mid">
          {noteCount !== undefined && (
            <Stat
              label="notes available"
              value={noteCount}
              empty="Add notes to power answers"
            />
          )}
          {chatCount !== undefined && (
            <Stat label="past chats" value={chatCount} empty="No chats yet" />
          )}
        </div>
      )}
      <div className="mt-8">
        <p className="text-[13px] text-ink-mid">
          Ask anything that can be answered from your notes. Each answer cites
          the source notes inline.
        </p>
        <p className="mt-1 text-[12px] text-ink-soft">
          Pick a suggestion below the composer, or type your own question.
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  empty,
}: {
  label: string;
  value: number;
  empty: string;
}) {
  if (value === 0) {
    return (
      <div>
        <div className="font-mono text-[18px] font-medium text-ink-soft">0</div>
        <div className="mt-0.5 text-[11px] text-ink-soft">{empty}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="font-mono text-[18px] font-medium text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wider text-ink-mid">
        {label}
      </div>
    </div>
  );
}

function MessageBlock({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-lg rounded-br-sm bg-ink px-4 py-2.5 text-[14px] text-white">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {message.mode === "no_notes" && <NoNotesBanner />}
      <AssistantBubble message={message} />
      {message.mode !== "no_notes" && message.notes && message.notes.length > 0 && (
        <SourcesList notes={message.notes} />
      )}
    </div>
  );
}

function NoNotesBanner() {
  return (
    <div className="flex items-center gap-2 rounded border border-warn-ink/30 bg-warn-bg px-3 py-2 text-[12px] text-warn-ink">
      <span className="inline-block size-1.5 rounded-full bg-warn-ink" />
      <span>No matching notes — answered from general knowledge.</span>
      <Link
        href="/ingest"
        className="ml-auto text-warn-ink underline underline-offset-2 hover:opacity-80"
      >
        Add a note →
      </Link>
    </div>
  );
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  const content = withCitationLinks(message.content, message.notes ?? []);
  return (
    <div className="py-2">
      {message.content || message.pending ? (
        <Markdown variant="serif">{content}</Markdown>
      ) : null}
      {message.pending && (
        <div className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-mid">
          <span className="inline-block size-1.5 animate-pulse rounded-full bg-red" />
          generating
        </div>
      )}
    </div>
  );
}

function SourcesList({ notes }: { notes: CitedNote[] }) {
  return (
    <div className="space-y-2 border-t border-hairline pt-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-mid">
        Retrieved sources ({notes.length})
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {notes.map((n) => (
          <li key={n.id}>
            <Link
              href={`/notes/${n.id}`}
              className={cn(
                "inline-flex items-baseline gap-1 rounded bg-bg-soft px-2.5 py-1 text-[12px] text-ink",
                "hover:bg-red hover:text-white",
              )}
              title={`${n.domain} / ${n.sub_category}`}
            >
              {n.heading}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function withCitationLinks(content: string, notes: CitedNote[]): string {
  if (!content) return content;

  const byId = new Map(notes.map((n) => [n.id, n]));
  const numbering = new Map<string, number>();

  return content.replace(/\[\^([0-9a-f-]{36})\]/gi, (_match, uuid: string) => {
    const note = byId.get(uuid);
    if (!note) return "";

    let num = numbering.get(uuid);
    if (num === undefined) {
      num = numbering.size + 1;
      numbering.set(uuid, num);
    }
    return ` [${toSuperscript(num)}](/notes/${uuid} "${escapeTitle(note.heading)}")`;
  });
}

const SUPERSCRIPT = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

function toSuperscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUPERSCRIPT[Number(d)] ?? d)
    .join("");
}

function escapeTitle(s: string): string {
  return s.replace(/"/g, "'");
}
