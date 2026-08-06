import type Anthropic from "@anthropic-ai/sdk";

// Types shared between the server agent (agent.ts / actions) and the client chat
// UI. No runtime code and no "server-only" import, so it's safe in both bundles.

export type ChatMessage = Anthropic.MessageParam;

export interface ProposedAction {
  toolUseId: string;
  action: string; // whitelist key, e.g. "assign_vehicle"
  title: string; // short human label
  summary: string; // plain-English description of what will happen
  params: Record<string, unknown>; // validated params to execute on confirm
}

export type ChitsanoTurn =
  | { type: "message"; text: string; messages: ChatMessage[] }
  | { type: "proposal"; text: string; proposal: ProposedAction; messages: ChatMessage[] }
  | { type: "error"; text: string; messages: ChatMessage[] }
  | { type: "unconfigured" };
