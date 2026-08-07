"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// Chat tables/functions aren't in the generated Database types, so we use the
// browser client through an untyped view and type the rows ourselves here.

export interface Conversation {
  conversation_id: string;
  is_group: boolean;
  other_id: string | null;
  other_name: string | null;
  other_role: string | null;
  other_avatar: string | null;
  other_last_seen: string | null;
  last_body: string | null;
  last_at: string | null;
  last_sender: string | null;
  unread: number;
  updated_at: string;
}
export interface Contact {
  id: string;
  full_name: string;
  role: string;
  avatar_url: string | null;
  last_seen: string | null;
}
export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_kind: "user" | "chitsano";
  kind: "text" | "sticker";
  body: string;
  created_at: string;
}

export function chatClient(): SupabaseClient {
  return createClient() as unknown as SupabaseClient;
}

export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await chatClient().schema("app").rpc("fn_my_conversations");
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function listContacts(): Promise<Contact[]> {
  const { data, error } = await chatClient().schema("app").rpc("fn_chat_contacts");
  if (error) throw error;
  return (data ?? []) as Contact[];
}

/** Keep the current user's presence fresh (online / last seen). */
export async function heartbeat(): Promise<void> {
  try {
    await chatClient().schema("app").rpc("fn_heartbeat");
  } catch {
    /* presence is best-effort */
  }
}

/** Make sure the current user is in the team group; returns the team id. */
export async function ensureTeam(): Promise<string | null> {
  const { data, error } = await chatClient().schema("app").rpc("fn_ensure_team_membership");
  if (error) return null;
  return (data as string) ?? null;
}

/** Human members of a conversation (for group sender names + @mentions). */
export async function listMembers(conversationId: string): Promise<Contact[]> {
  const { data, error } = await chatClient().schema("app").rpc("fn_conversation_members", { p_conversation: conversationId });
  if (error) throw error;
  return (data ?? []) as Contact[];
}

export async function getOrCreateDm(otherId: string): Promise<string> {
  const { data, error } = await chatClient().schema("app").rpc("fn_get_or_create_dm", { p_other: otherId });
  if (error) throw error;
  return data as string;
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await chatClient()
    .schema("app")
    .from("messages")
    .select("id, conversation_id, sender_id, sender_kind, kind, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
  kind: "text" | "sticker" = "text",
): Promise<Message> {
  const { data, error } = await chatClient()
    .schema("app")
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: senderId, body, kind })
    .select("id, conversation_id, sender_id, sender_kind, kind, body, created_at")
    .single();
  if (error) throw error;
  return data as Message;
}

export async function markRead(conversationId: string): Promise<void> {
  await chatClient().schema("app").rpc("fn_mark_conversation_read", { p_conversation: conversationId });
}
