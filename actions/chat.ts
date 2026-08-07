"use server";

import { requireAuth } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/service";
import { ask } from "@/lib/chitsano/engine";

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
    .select("id, is_group")
    .eq("id", conversationId)
    .maybeSingle<{ id: string; is_group: boolean }>();
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
  let body: string;
  try {
    const reply = await ask(clean || "help", { allowFinance: false });
    body =
      reply.type === "proposal"
        ? "I can only answer questions here. For actions like assigning a vehicle, open Chitsano from the menu."
        : reply.text;
  } catch {
    body = "Sorry, I couldn't work that out just now.";
  }

  await service
    .schema("app")
    .from("messages")
    .insert({ conversation_id: conversationId, sender_id: null, sender_kind: "chitsano", body });
}
