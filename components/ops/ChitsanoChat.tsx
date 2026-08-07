"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Check, X, ShieldCheck, Loader2 } from "lucide-react";
import { chitsanoAsk, chitsanoConfirm } from "@/actions/chitsano";
import type { ProposedAction, Reply } from "@/lib/chitsano/shared";

interface Bubble {
  id: number;
  role: "user" | "assistant" | "note";
  text: string;
  error?: boolean;
}

const SUGGESTIONS = [
  "Who isn't logging in?",
  "Any recent accidents?",
  "Which drivers have no vehicle?",
  "How are we doing financially?",
];

export function ChitsanoChat() {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [pending, setPending] = useState<ProposedAction | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const nextId = () => ++idRef.current;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [bubbles, pending, busy]);

  function push(role: Bubble["role"], text: string, error = false) {
    setBubbles((b) => [...b, { id: nextId(), role, text, error }]);
  }

  function applyReply(reply: Reply) {
    if (reply.type === "message") {
      push("assistant", reply.text);
    } else {
      if (reply.text) push("assistant", reply.text);
      setPending(reply.proposal);
    }
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy || pending) return;
    setInput("");
    push("user", trimmed);
    setBusy(true);
    try {
      applyReply(await chitsanoAsk(trimmed));
    } catch {
      push("assistant", "I couldn't reach the server — please try again.", true);
    } finally {
      setBusy(false);
    }
  }

  async function decide(approve: boolean) {
    if (!pending || busy) return;
    const proposal = pending;
    setPending(null);
    push("note", approve ? "You confirmed the action" : "You cancelled the action");
    setBusy(true);
    try {
      applyReply(await chitsanoConfirm(proposal, approve));
    } catch {
      push("assistant", "I couldn't complete that — please try again.", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-13rem)] min-h-[420px] flex-col overflow-hidden rounded-3xl border border-ink-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* Scroll area */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-5 lg:px-6">
        {bubbles.length === 0 && !busy && (
          <div className="mx-auto max-w-md py-6 text-center">
            <div className="mx-auto mb-3 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-600/25">
              <Sparkles className="h-7 w-7" />
            </div>
            <p className="text-lg font-bold text-ink-900">Ask Chitsano</p>
            <p className="mt-1 text-sm text-ink-500">
              Your built-in fleet assistant. Ask about vehicles, drivers, accidents, trips, attendance, logins or finance — or ask it to assign a vehicle.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-ink-200 bg-ink-50/60 px-3 py-1.5 text-xs font-medium text-ink-600 transition-colors hover:border-orange-300 hover:text-orange-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {bubbles.map((b) =>
          b.role === "note" ? (
            <div key={b.id} className="flex justify-center">
              <span className="rounded-full bg-ink-100 px-3 py-1 text-[11px] font-semibold text-ink-500">{b.text}</span>
            </div>
          ) : (
            <div key={b.id} className={`flex ${b.role === "user" ? "justify-end" : "justify-start"}`}>
              {b.role === "assistant" && (
                <span className="mr-2 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white">
                  <Sparkles className="h-4 w-4" />
                </span>
              )}
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  b.role === "user"
                    ? "bg-ink-900 text-white"
                    : b.error
                      ? "border border-rose-200 bg-rose-50 text-rose-700"
                      : "border border-ink-200/70 bg-ink-50/50 text-ink-800"
                }`}
              >
                {b.text}
              </div>
            </div>
          ),
        )}

        {/* Proposal card */}
        {pending && (
          <div className="flex justify-start">
            <span className="mr-2 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div className="max-w-[85%] rounded-2xl border border-orange-200 bg-orange-50/70 p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-orange-700">
                <ShieldCheck className="h-3.5 w-3.5" /> Confirm to continue
              </p>
              <p className="mt-1.5 text-sm font-semibold text-ink-900">{pending.title}</p>
              <p className="mt-1 text-sm text-ink-700">{pending.summary}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => decide(true)}
                  disabled={busy}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Confirm
                </button>
                <button
                  type="button"
                  onClick={() => decide(false)}
                  disabled={busy}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-4 text-sm font-semibold text-ink-600 hover:bg-ink-50 disabled:opacity-50"
                >
                  <X className="h-4 w-4" /> Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {busy && (
          <div className="flex items-center gap-2 pl-10 text-sm text-ink-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Chitsano is checking…
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-ink-100 bg-white px-3 py-3 lg:px-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={pending ? "Confirm or cancel the action above first…" : "Ask Chitsano anything about the fleet…"}
          disabled={busy || !!pending}
          className="h-11 flex-1 rounded-xl border border-ink-200 bg-white px-4 text-sm text-ink-900 placeholder:text-ink-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:bg-ink-50"
        />
        <button
          type="submit"
          disabled={busy || !!pending || !input.trim()}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white transition-colors hover:bg-orange-700 disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
