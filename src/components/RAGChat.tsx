"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Markdown } from "./Markdown";

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

      <div className="pt-4">
        {isEmpty && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setInput(q)}
                disabled={running}
                className="rounded-full border border-hairline px-3 py-1 text-[12px] text-ink-mid transition-colors hover:border-hairline-strong hover:bg-panel hover:text-ink disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-3 rounded-[13px] bg-panel py-[7px] pl-[18px] pr-[7px]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            placeholder="Ask anything about your notes…"
            disabled={running}
            className="max-h-[120px] w-full resize-none bg-transparent py-2 text-[14.5px] leading-normal text-ink outline-none placeholder:text-ink-soft disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => send()}
            disabled={running || !input.trim()}
            className="shrink-0 rounded-[9px] bg-red px-[22px] py-[11px] text-[13px] font-semibold text-white hover:bg-red-deep disabled:opacity-40"
          >
            {running ? "Thinking…" : "Send"}
          </button>
        </div>
        <div className="mt-2 text-[11px] text-ink-soft">
          <b className="font-mono font-medium text-ink-mid">↵</b> send ·{" "}
          <b className="font-mono font-medium text-ink-mid">⇧↵</b> newline
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
        <div className="max-w-[70%] rounded-[14px] rounded-br-[4px] bg-ink px-4 py-[11px] text-[14.5px] text-white">
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
    <div className="max-w-[680px] py-2">
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
    <div className="max-w-[680px] border-t border-hairline pt-3.5">
      <div className="mb-2 font-mono text-[9.5px] font-semibold uppercase tracking-[.12em] text-ink-soft">
        Sources · {notes.length} note{notes.length === 1 ? "" : "s"}
      </div>
      <ul className="space-y-[5px]">
        {notes.map((n, i) => (
          <li key={n.id}>
            <Link
              href={`/notes/${n.id}`}
              className="group flex items-center gap-2.5 rounded-lg bg-panel px-3 py-[9px] hover:bg-panel-deep"
            >
              <span className="w-3.5 shrink-0 font-mono text-[10px] font-semibold text-red">
                {i + 1}
              </span>
              <b className="shrink-0 text-[13px] font-semibold text-ink">
                {n.heading}
              </b>
              <span className="truncate text-[12px] text-ink-mid">
                {n.domain} ·{" "}
                <em className="not-italic text-red">{n.sub_category}</em>
              </span>
              <span className="ml-auto shrink-0 text-[11.5px] font-medium text-red opacity-0 transition-opacity group-hover:opacity-100">
                open →
              </span>
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
