"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, ChevronLeft, Send, Search, PenSquare, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  chatClient, listConversations, listContacts, getOrCreateDm, listMessages, sendMessage, markRead,
  type Conversation, type Contact, type Message,
} from "@/lib/chat/api";

type View = "list" | "contacts" | "thread";

function initials(name: string | null): string {
  return (name ?? "?").trim().charAt(0).toUpperCase() || "?";
}
function roleLabel(role: string | null): string {
  if (!role) return "";
  if (role === "fleet_manager") return "Manager";
  return role.charAt(0).toUpperCase() + role.slice(1);
}
function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function fmtListTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toLocaleDateString("en-CA");
  const day = d.toLocaleDateString("en-CA");
  if (day === today) return fmtTime(iso);
  const yst = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  if (day === yst) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

// Colour the avatar deterministically from the name.
const AV = ["bg-orange-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-rose-500", "bg-amber-500", "bg-teal-500"];
function avatarColor(key: string | null): string {
  const s = key ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV[h % AV.length];
}

export function ChatWidget({
  currentProfileId,
  currentName,
  offsetClass = "bottom-6",
}: {
  currentProfileId: string;
  currentName: string;
  offsetClass?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);

  const activeIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const totalUnread = conversations.reduce((s, c) => s + (c.unread || 0), 0);

  async function refreshList() {
    try {
      setConversations(await listConversations());
    } catch {
      /* silent — realtime will retry on next event */
    }
  }

  // Initial load + realtime subscription (once).
  useEffect(() => {
    setLoadingList(true);
    listConversations()
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoadingList(false));

    const channel = chatClient()
      .channel("chat-messages")
      .on("postgres_changes", { event: "INSERT", schema: "app", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        if (m.conversation_id === activeIdRef.current) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_id !== currentProfileId) markRead(m.conversation_id);
        }
        refreshList();
      })
      .subscribe();
    return () => {
      chatClient().removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProfileId]);

  // Keep the thread scrolled to the latest message.
  useEffect(() => {
    if (view === "thread") scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, view]);

  async function openThread(conv: Conversation) {
    setActive(conv);
    activeIdRef.current = conv.conversation_id;
    setView("thread");
    setMessages([]);
    setLoadingThread(true);
    try {
      setMessages(await listMessages(conv.conversation_id));
      await markRead(conv.conversation_id);
      setConversations((prev) => prev.map((c) => (c.conversation_id === conv.conversation_id ? { ...c, unread: 0 } : c)));
    } catch {
      toast.error("Couldn't open that chat.");
    } finally {
      setLoadingThread(false);
    }
  }

  async function openContacts() {
    setView("contacts");
    if (contacts.length === 0) {
      try {
        setContacts(await listContacts());
      } catch {
        toast.error("Couldn't load contacts.");
      }
    }
  }

  async function startChat(contact: Contact) {
    try {
      const convId = await getOrCreateDm(contact.id);
      await openThread({
        conversation_id: convId,
        other_id: contact.id,
        other_name: contact.full_name,
        other_role: contact.role,
        other_avatar: contact.avatar_url,
        last_body: null,
        last_at: null,
        last_sender: null,
        unread: 0,
        updated_at: new Date().toISOString(),
      });
      refreshList();
    } catch {
      toast.error("Couldn't start that chat.");
    }
  }

  async function send() {
    const body = input.trim();
    if (!body || !active || sending) return;
    setInput("");
    setSending(true);
    try {
      const msg = await sendMessage(active.conversation_id, currentProfileId, body);
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]));
      refreshList();
    } catch {
      setInput(body);
      toast.error("Message not sent — try again.");
    } finally {
      setSending(false);
    }
  }

  function back() {
    if (view === "thread") {
      setView("list");
      setActive(null);
      activeIdRef.current = null;
      refreshList();
    } else if (view === "contacts") {
      setView("list");
    }
  }

  const filteredContacts = contactQuery.trim()
    ? contacts.filter((c) => `${c.full_name} ${roleLabel(c.role)}`.toLowerCase().includes(contactQuery.trim().toLowerCase()))
    : contacts;

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            refreshList();
          }}
          aria-label="Open messages"
          className={`fixed ${offsetClass} right-6 z-[55] flex h-14 w-14 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg shadow-orange-600/30 transition-transform hover:bg-orange-600 active:scale-95`}
        >
          <MessageCircle className="h-7 w-7" />
          {totalUnread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-xs font-bold text-white">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[560px] sm:max-h-[82vh] sm:w-[380px] sm:overflow-hidden sm:rounded-3xl sm:border sm:border-ink-200 sm:shadow-2xl">
          {/* Header */}
          <div className="flex items-center gap-2 bg-ink-900 px-3 py-3 text-white">
            {view !== "list" ? (
              <button type="button" onClick={back} aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10">
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                <MessageCircle className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              {view === "thread" && active ? (
                <>
                  <p className="truncate text-sm font-bold leading-tight">{active.other_name ?? "Chat"}</p>
                  <p className="truncate text-[11px] text-white/60">{roleLabel(active.other_role)}</p>
                </>
              ) : (
                <p className="text-sm font-bold">{view === "contacts" ? "New chat" : "Messages"}</p>
              )}
            </div>
            {view === "list" && (
              <button type="button" onClick={openContacts} aria-label="New chat" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10">
                <PenSquare className="h-5 w-5" />
              </button>
            )}
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          {view === "list" && (
            <div className="flex-1 overflow-y-auto">
              {loadingList && conversations.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : conversations.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-500">
                    <MessageCircle className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-bold text-ink-900">No chats yet</p>
                  <p className="mt-1 text-xs text-ink-500">Message anyone on the team — drivers, managers or admin.</p>
                  <button
                    type="button"
                    onClick={openContacts}
                    className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600"
                  >
                    <PenSquare className="h-4 w-4" /> Start a chat
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {conversations.map((c) => (
                    <li key={c.conversation_id}>
                      <button type="button" onClick={() => openThread(c)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-ink-50/60">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-white ${avatarColor(c.other_id)}`}>
                          {initials(c.other_name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-ink-900">{c.other_name ?? "Unknown"}</span>
                            <span className="shrink-0 text-[11px] text-ink-400">{fmtListTime(c.last_at)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-ink-500">
                              {c.last_sender === currentProfileId ? "You: " : ""}
                              {c.last_body ?? "No messages yet"}
                            </span>
                            {c.unread > 0 && (
                              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-orange-500 px-1 text-[11px] font-bold text-white">
                                {c.unread}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {view === "contacts" && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="relative border-b border-ink-100 p-3">
                <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  placeholder="Search people…"
                  className="h-10 w-full rounded-xl border border-ink-200 bg-white pl-10 pr-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredContacts.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-ink-400">No people match.</p>
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {filteredContacts.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => startChat(p)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-ink-50/60">
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor(p.id)}`}>
                            {initials(p.full_name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-ink-900">{p.full_name}</span>
                            <span className="block truncate text-xs text-ink-400">{roleLabel(p.role)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {view === "thread" && active && (
            <>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-ink-50/60 px-3 py-4">
                {loadingThread ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 py-10 text-center">
                    <Users className="h-6 w-6 text-ink-300" />
                    <p className="text-xs text-ink-400">Say hello to {active.other_name}.</p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === currentProfileId;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                            mine ? "rounded-br-sm bg-emerald-100 text-ink-900" : "rounded-bl-sm border border-ink-100 bg-white text-ink-900"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                          <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-emerald-700/70" : "text-ink-400"}`}>{fmtTime(m.created_at)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="flex items-center gap-2 border-t border-ink-100 bg-white p-2.5"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message…"
                  className="h-11 flex-1 rounded-full border border-ink-200 bg-white px-4 text-sm text-ink-900 placeholder:text-ink-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || sending}
                  aria-label="Send"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white transition-colors hover:bg-orange-600 disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
