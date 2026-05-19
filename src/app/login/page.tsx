"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

const initial: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(sendMagicLink, initial);

  return (
    <main className="mx-auto flex min-h-screen max-w-[360px] flex-col justify-center px-6">
      <div className="mb-10">
        <div className="text-[15px] font-semibold tracking-wide">
          <span className="mr-1 text-red">●</span>NOUS
        </div>
        <p className="mt-2 text-[13px] text-ink-mid">
          Personal learning assistant — categorize, define, recall.
        </p>
      </div>

      {state.sent ? (
        <div className="rounded border border-hairline-strong bg-bg-input p-4 text-[13px] text-ink">
          Check your inbox — we just sent you a sign-in link.
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <label className="text-[11px] font-medium uppercase tracking-wider text-ink-mid">
            Email
          </label>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="rounded border border-hairline-strong bg-bg-input px-3 py-2.5 text-[14px] text-ink outline-none placeholder:text-ink-soft focus:border-ink"
          />
          <button
            type="submit"
            disabled={pending}
            className="mt-1 rounded bg-red px-3 py-2.5 text-[13px] font-medium text-white hover:bg-red-deep disabled:opacity-50"
          >
            {pending ? "Sending…" : "Send magic link"}
          </button>
          {state.error && (
            <p className="text-[12px] text-red-deep">{state.error}</p>
          )}
        </form>
      )}
    </main>
  );
}
