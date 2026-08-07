// Types shared between the server engine (engine.ts / actions) and the client
// chat UI. No runtime code, no external SDK — Chitsano runs entirely in-app.

export interface ProposedAction {
  action: string; // whitelist key, e.g. "assign_vehicle"
  title: string; // short human label
  summary: string; // plain-English description of what will happen
  params: Record<string, unknown>; // validated params to execute on confirm
}

export type Reply =
  | { type: "message"; text: string }
  | { type: "proposal"; text: string; proposal: ProposedAction };
