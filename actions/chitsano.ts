"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { ask, runAction } from "@/lib/chitsano/engine";
import type { Reply, ProposedAction } from "@/lib/chitsano/shared";

/**
 * Ask Chitsano a question. Gated to managers/admins — drivers and billing users
 * never reach the assistant. Stateless: each message is answered on its own.
 */
export async function chitsanoAsk(text: string): Promise<Reply> {
  await requireRole("fleet_manager", "admin");
  if (typeof text !== "string" || !text.trim()) {
    return { type: "message", text: "Ask me something about the fleet." };
  }
  return ask(text);
}

/**
 * Resolve a proposed action. On approve, execute it against the write-tool
 * whitelist (the ONLY place a Chitsano action touches the database). On decline,
 * nothing happens.
 */
export async function chitsanoConfirm(proposal: ProposedAction, approve: boolean): Promise<Reply> {
  const profile = await requireRole("fleet_manager", "admin");
  if (!proposal?.action) return { type: "message", text: "That action is no longer valid." };
  if (!approve) return { type: "message", text: "No problem — I've cancelled that." };

  let result: string;
  try {
    result = await runAction(proposal.action, proposal.params ?? {}, { profileId: profile.id });
  } catch (e) {
    result = `The action failed: ${e instanceof Error ? e.message : "unknown error"}`;
  }

  // Refresh the views a Chitsano write can affect.
  revalidatePath("/vehicles");
  revalidatePath("/drivers");
  revalidatePath("/live");

  return { type: "message", text: result };
}
