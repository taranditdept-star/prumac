"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, ChevronLeft, Send, Search, PenSquare, Users, Loader2, Smile, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  chatClient, listConversations, listContacts, listMembers, ensureTeam, getOrCreateDm, listMessages, sendMessage, markRead,
  type Conversation, type Contact, type Message,
} from "@/lib/chat/api";
import { chitsanoGroupReply } from "@/actions/chat";

type View = "list" | "contacts" | "thread";

const EMOJIS = ["😀","😁","😂","🤣","😊","😍","😎","😅","😴","🤔","😳","😢","😡","😬","🤦","🫡","👋","🙏","👍","👎","👌","👏","🙌","💪","🔥","✅","❌","⚠️","🚗","🚚","⛽","🛞","🔧","📍","🕒","💬","❤️","🎉","🚨","📞","📅","💰","📦","🏁","🆗","🙋","☑️","😉"];

function initials(name: string | null): string {
  return (name ?? "?").trim().charAt(0).toUpperCase() || "?";
}
function roleLabel(role: string | null): string {
  if (!role) return "";
  if (role === "fleet_manager") return "Manager";
  if (role === "group") return "Team group";
  return role.charAt(0).toUpperCase() + role.slice(1);
}
function firstName(name: string): string {
  return (name.split(" ")[0] || name).replace(/[^A-Za-z0-9]/g, "");
}
function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function fmtListTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toLocaleDateString("en-CA");
  if (d.toLocaleDateString("en-CA") === today) return fmtTime(iso);
  if (d.toLocaleDateString("en-CA") === new Date(Date.now() - 86400000).toLocaleDateString("en-CA")) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

const AV = ["bg-orange-500", "bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-rose-500", "bg-amber-500", "bg-teal-500"];
function avatarColor(key: string | null): string {
  const s = key ?? "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AV[h % AV.length];
}

// Highlight @mentions in message text.
function renderBody(text: string) {
  return text.split(/(@\w+)/g).map((p, i) =>
    /^@\w+$/.test(p) ? (
      <span key={i} className="font-semibold text-orange-600">{p}</span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
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
  const [members, setMembers] = useState<Contact[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [contactQuery, setContactQuery] = useState("");
  const [loadingList, setLoadingList] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [botTyping, setBotTyping] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mention, setMention] = useState<{ active: boolean; query: string }>({ active: false, query: "" });

  const activeIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const totalUnread = conversations.reduce((s, c) => s + (c.unread || 0), 0);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  async function refreshList() {
    try {
      setConversations(await listConversations());
    } catch {
      /* silent */
    }
  }

  useEffect(() => {
    setLoadingList(true);
    ensureTeam()
      .then(() => listConversations())
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoadingList(false));

    const channel = chatClient()
      .channel("chat-messages")
      .on("postgres_changes", { event: "INSERT", schema: "app", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        if (m.conversation_id === activeIdRef.current) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
          if (m.sender_kind === "chitsano") setBotTyping(false);
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

  useEffect(() => {
    if (view === "thread") scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, view, botTyping]);

  async function openThread(conv: Conversation) {
    setActive(conv);
    activeIdRef.current = conv.conversation_id;
    setView("thread");
    setMessages([]);
    setMembers([]);
    setShowEmoji(false);
    setMention({ active: false, query: "" });
    setLoadingThread(true);
    try {
      if (conv.is_group) listMembers(conv.conversation_id).then(setMembers).catch(() => {});
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
        conversation_id: convId, is_group: false,
        other_id: contact.id, other_name: contact.full_name, other_role: contact.role, other_avatar: contact.avatar_url,
        last_body: null, last_at: null, last_sender: null, unread: 0, updated_at: new Date().toISOString(),
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
    setShowEmoji(false);
    setMention({ active: false, query: "" });
    setSending(true);
    try {
      const msg = await sendMessage(active.conversation_id, currentProfileId, body);
      setMessages((prev) => (prev.some((x) => x.id === msg.id) ? prev : [...prev, msg]));
      refreshList();
      if (active.is_group && /@chitsano/i.test(body)) {
        setBotTyping(true);
        chitsanoGroupReply(active.conversation_id, body).finally(() => setBotTyping(false));
      }
    } catch {
      setInput(body);
      toast.error("Message not sent — try again.");
    } finally {
      setSending(false);
    }
  }

  function onInputChange(val: string) {
    setInput(val);
    if (active?.is_group) {
      const m = val.match(/@(\w*)$/);
      setMention(m ? { active: true, query: m[1] } : { active: false, query: "" });
    }
  }

  function pickMention(name: string, isBot: boolean) {
    const token = isBot ? "Chitsano" : firstName(name);
    setInput((prev) => prev.replace(/@(\w*)$/, `@${token} `));
    setMention({ active: false, query: "" });
  }

  function back() {
    if (view === "thread") {
      setView("list");
      setActive(null);
      activeIdRef.current = null;
      setShowEmoji(false);
      refreshList();
    } else if (view === "contacts") {
      setView("list");
    }
  }

  const filteredContacts = contactQuery.trim()
    ? contacts.filter((c) => `${c.full_name} ${roleLabel(c.role)}`.toLowerCase().includes(contactQuery.trim().toLowerCase()))
    : contacts;

  const mentionCandidates = mention.active
    ? [{ id: "chitsano", full_name: "Chitsano AI", role: "assistant", avatar_url: null } as Contact, ...members.filter((m) => m.id !== currentProfileId)]
        .filter((c) => c.full_name.toLowerCase().includes(mention.query.toLowerCase()))
        .slice(0, 6)
    : [];

  return (
    <>
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
                  <p className="truncate text-[11px] text-white/60">
                    {active.is_group ? `${members.length} members · @Chitsano to ask` : roleLabel(active.other_role)}
                  </p>
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

          {/* List */}
          {view === "list" && (
            <div className="flex-1 overflow-y-auto">
              {loadingList && conversations.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-400">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {conversations.map((c) => (
                    <li key={c.conversation_id}>
                      <button type="button" onClick={() => openThread(c)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-ink-50/60">
                        {c.is_group ? (
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink-800 text-white">
                            <Users className="h-5 w-5" />
                          </span>
                        ) : (
                          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-white ${avatarColor(c.other_id)}`}>
                            {initials(c.other_name)}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-ink-900">{c.other_name ?? "Unknown"}</span>
                            <span className="shrink-0 text-[11px] text-ink-400">{fmtListTime(c.last_at)}</span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-ink-500">
                              {c.last_sender === currentProfileId ? "You: " : ""}
                              {c.last_body ?? (c.is_group ? "Tap to open the team chat" : "No messages yet")}
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

          {/* Contacts */}
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

          {/* Thread */}
          {view === "thread" && active && (
            <>
              <div ref={scrollRef} className="flex-1 space-y-1.5 overflow-y-auto bg-ink-50/60 px-3 py-4">
                {loadingThread ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 py-10 text-center">
                    <Users className="h-6 w-6 text-ink-300" />
                    <p className="text-xs text-ink-400">
                      {active.is_group ? "Say hello to the team. Tag @Chitsano to ask about logins, faults, trips…" : `Say hello to ${active.other_name}.`}
                    </p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const bot = m.sender_kind === "chitsano";
                    const mine = !bot && m.sender_id === currentProfileId;
                    const showName = active.is_group && !mine;
                    const senderName = bot ? "Chitsano AI" : memberMap.get(m.sender_id ?? "")?.full_name ?? "Member";
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                            bot
                              ? "rounded-bl-sm border border-orange-200 bg-orange-50 text-ink-900"
                              : mine
                                ? "rounded-br-sm bg-emerald-100 text-ink-900"
                                : "rounded-bl-sm border border-ink-100 bg-white text-ink-900"
                          }`}
                        >
                          {(showName || bot) && (
                            <p className={`mb-0.5 flex items-center gap-1 text-[11px] font-bold ${bot ? "text-orange-600" : "text-ink-500"}`}>
                              {bot && <Sparkles className="h-3 w-3" />}
                              {senderName}
                            </p>
                          )}
                          <p className="whitespace-pre-wrap break-words">{renderBody(m.body)}</p>
                          <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-emerald-700/70" : "text-ink-400"}`}>{fmtTime(m.created_at)}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                {botTyping && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-1.5 rounded-2xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700">
                      <Sparkles className="h-3.5 w-3.5" /> Chitsano is thinking…
                    </div>
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
                className="relative flex items-center gap-2 border-t border-ink-100 bg-white p-2.5"
              >
                {/* @mention autocomplete */}
                {mention.active && mentionCandidates.length > 0 && (
                  <div className="absolute bottom-full left-2.5 right-2.5 mb-1 max-h-56 overflow-y-auto rounded-xl border border-ink-200 bg-white py-1 shadow-xl">
                    {mentionCandidates.map((c) => {
                      const isBot = c.id === "chitsano";
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => pickMention(c.full_name, isBot)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-ink-50"
                        >
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${isBot ? "bg-orange-500" : avatarColor(c.id)}`}>
                            {isBot ? <Sparkles className="h-3.5 w-3.5" /> : initials(c.full_name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-ink-900">{c.full_name}</span>
                            <span className="block truncate text-[11px] text-ink-400">{isBot ? "Assistant" : roleLabel(c.role)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* emoji picker */}
                {showEmoji && (
                  <div className="absolute bottom-full left-2.5 mb-1 grid w-64 grid-cols-8 gap-0.5 rounded-xl border border-ink-200 bg-white p-2 shadow-xl">
                    {EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => {
                          setInput((prev) => prev + e);
                          setShowEmoji(false);
                        }}
                        className="rounded-lg py-1 text-xl hover:bg-ink-100"
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowEmoji((v) => !v);
                    setMention({ active: false, query: "" });
                  }}
                  aria-label="Emoji"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                >
                  <Smile className="h-5 w-5" />
                </button>
                <input
                  value={input}
                  onChange={(e) => onInputChange(e.target.value)}
                  placeholder={active.is_group ? "Message the team…  (@Chitsano to ask)" : "Type a message…"}
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
