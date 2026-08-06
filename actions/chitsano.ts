"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { runChitsano, continueAfterAction } from "@/lib/chitsano/agent";
import { WRITE_TOOLS } from "@/lib/chitsano/tools";
import type { ChatMessage, ChitsanoTurn, ProposedAction } from "@/lib/chitsano/shared";

/**
 * Send the current transcript (with a new user turn already appended client-side)
 * and run Chitsano until it answers or wants to perform an action. Gated to
 * managers/admins — drivers and billing users never reach the assistant.
 */
export async function chitsanoSend(messages: ChatMessage[]): Promise<ChitsanoTurn> {
  await requireRole("fleet_manager", "admin");
  if (!Array.isArray(messages) || messages.length === 0) {
    return { type: "error", text: "No message to send.", messages: messages ?? [] };
  }
  return runChitsano(messages);
}

/**
 * Resolve a proposed action. On approve, execute it against the write-tool
 * whitelist (the ONLY place a Chitsano action touches the database), then resume
 * the conversation so Chitsano can confirm the outcome in words. On decline, the
 * model is told the user said no and continues.
 */
export async function chitsanoConfirm(
  messages: ChatMessage[],
  proposal: ProposedAction,
  approve: boolean,
): Promise<ChitsanoTurn> {
  const profile = await requireRole("fleet_manager", "admin");
  const tool = proposal?.action ? WRITE_TOOLS[proposal.action] : undefined;
  if (!tool || !proposal.toolUseId) {
    return { type: "error", text: "That action is no longer valid.", messages };
  }

  if (!approve) {
    return continueAfterAction(messages, proposal.toolUseId, "The user declined to perform this action.");
  }

  let resultText: string;
  try {
    resultText = await tool.execute(proposal.params ?? {}, { profileId: profile.id });
  } catch (e) {
    resultText = `The action failed: ${e instanceof Error ? e.message : "unknown error"}`;
  }

  // Refresh the views a Chitsano write can affect.
  revalidatePath("/vehicles");
  revalidatePath("/drivers");
  revalidatePath("/live");

  return continueAfterAction(messages, proposal.toolUseId, resultText);
}
