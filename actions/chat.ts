"use server";

import { requireAuth } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToProfiles } from "@/lib/notifications/push";
import { ask } from "@/lib/chitsano/engine";

const cut = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n)}…` : s);

async function conversationMemberIds(conversationId: string, exclude?: string): Promise<string[]> {
  const service = createServiceClient();
  const { data } = await service
    .schema("app")
    .from("conversation_members")
    .select("profile_id")
    .eq("conversation_id", conversationId)
    .returns<{ profile_id: string }[]>();
  return (data ?? []).map((m) => m.profile_id).filter((id) => id !== exclude);
}

/**
 * Push a new message to the other members (called fire-and-forget after a client
 * insert — the message itself is already saved + delivered via Realtime).
 */
export async function notifyNewMessage(conversationId: string, body: string, isSticker = false): Promise<void> {
  const profile = await requireAuth();
  if (!conversationId) return;

  const service = createServiceClient();
  const { data: conv } = await service
    .schema("app")
    .from("conversations")
    .select("id, is_group, title")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; is_group: boolean; title: string | null }>();
  if (!conv) return;

  // Only a member may trigger a push for this conversation. Without this, any
  // authenticated user could POST to this action with an arbitrary conversation
  // id + body and fan out spoofed notifications to a thread they aren't in.
  const { data: me } = await service
    .schema("app")
    .from("conversation_members")
    .select("profile_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", profile.id)
    .maybeSingle<{ profile_id: string }>();
  if (!me) return;

  const others = await conversationMemberIds(conversationId, profile.id);
  if (others.length === 0) return;

  const senderName = profile.full_name ?? "Someone";
  const preview = isSticker ? "sent a sticker" : cut(body);
  const title = conv.is_group ? conv.title ?? "Team chat" : senderName;
  const pushBody = conv.is_group ? `${senderName}: ${preview}` : isSticker ? "Sent a sticker" : preview;

  await sendPushToProfiles(others, { title, body: pushBody, url: "/home", tag: `chat-${conversationId}`, kind: "chat" });
}

/**
 * A member tagged @Chitsano in a group. Run the free rules engine and post the
 * reply as a Chitsano message. Finance is disabled here — drivers are in the
 * team chat, so confidential figures stay in the private assistant.
 */
export async function chitsanoGroupReply(conversationId: string, userText: string): Promise<void> {
  const profile = await requireAuth();
  if (!conversationId || typeof userText !== "string") return;

  const service = createServiceClient();

  const { data: conv } = await service
    .schema("app")
    .from("conversations")
    .select("id, is_group, title")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; is_group: boolean; title: string | null }>();
  if (!conv || !conv.is_group) return;

  const { data: member } = await service
    .schema("app")
    .from("conversation_members")
    .select("profile_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", profile.id)
    .maybeSingle<{ profile_id: string }>();
  if (!member) return; // only members can invoke the bot

  const clean = userText.replace(/@chitsano(\s+ai)?/gi, "").trim();
  let replyBody: string;
  try {
    const reply = await ask(clean || "help", { allowFinance: false });
    replyBody =
      reply.type === "proposal"
        ? "I can only answer questions here. For actions like assigning a vehicle, open Chitsano from the menu."
        : reply.text;
  } catch {
    replyBody = "Sorry, I couldn't work that out just now.";
  }

  await service
    .schema("app")
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: null, sender_kind: "chitsano", body: replyBody });

  const members = await conversationMemberIds(conversationId, profile.id);
  await sendPushToProfiles(members, {
    title: conv.title ?? "Team chat",
    body: `Chitsano AI: ${cut(replyBody)}`,
    url: "/home",
    tag: `chat-${conversationId}`,
    kind: "chat",
  });
}
