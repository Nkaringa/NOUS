"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { sendMagicLink, type LoginState } from "./actions";

const initial: LoginState = {};

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const [state, formAction, pending] = useActionState(sendMagicLink, initial);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-8">
        <div className="w-[400px]">
          <div className="flex items-baseline gap-2.5">
            <span className="text-[26px] font-bold tracking-[.05em] text-ink">NOUS</span>
            <span className="font-serif text-[17px] text-ink-soft">νοῦς</span>
          </div>
          <p className="mt-2.5 font-serif text-[15.5px] leading-[1.55] text-ink-mid">
            A personal learning system. Capture what you learn, let it organize
            itself, ask it anything later.
          </p>

          <div className="mt-8 rounded-2xl bg-panel p-6">
            {state.sent ? (
              <div className="text-[13.5px] leading-relaxed text-ink">
                Check your inbox — we just sent you a sign-in link.
                {next !== "/" && (
                  <div className="mt-2 text-[11.5px] text-ink-mid">
                    You&apos;ll land back on{" "}
                    <code className="font-mono">{next}</code> after clicking it.
                  </div>
                )}
              </div>
            ) : (
              <form action={formAction}>
                {/* Carry the post-login destination through the magic link */}
                <input type="hidden" name="next" value={next} />

                <label
                  htmlFor="email"
                  className="mb-2 block font-mono text-[10px] font-semibold uppercase tracking-[.13em] text-ink-soft"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-[10px] bg-tile px-4 py-3 text-[14.5px] text-ink shadow-[0_1px_2px_rgba(0,0,0,.04)] outline-none placeholder:text-ink-soft focus:ring-2 focus:ring-ink"
                />
                <button
                  type="submit"
                  disabled={pending}
                  className="mt-2.5 w-full rounded-[10px] bg-red py-3 text-[14px] font-semibold text-white hover:bg-red-deep disabled:opacity-50"
                >
                  {pending ? "Sending…" : "Send magic link"}
                </button>
                <div className="mt-3.5 text-center text-[12px] text-ink-soft">
                  New here? The same link creates your account.
                </div>
                {state.error && (
                  <p className="mt-3 text-center text-[12px] text-red-deep">
                    {state.error}
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
