import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { READ_TOOLS, WRITE_TOOLS, ALL_TOOL_DEFS, buildSystemPrompt } from "./tools";
import type { ChatMessage, ChitsanoTurn } from "./shared";

export type { ChatMessage, ProposedAction, ChitsanoTurn } from "./shared";

// Chitsano AI — a conversational assistant for managers/admins. It answers
// questions from live fleet data (read tools run immediately) and can PROPOSE a
// small set of actions. Write tools never execute inside the loop: they pause as
// a "proposal" the user must confirm in the UI, after which `continueAfterAction`
// resumes the conversation. The actual DB write happens in actions/chitsano.ts
// against a validated whitelist — never by trusting the chat transcript.

// A fast, cheap, strong tool-user is the right fit for an interactive Q&A
// assistant over small structured data. Swap this one constant to change tiers.
const CHITSANO_MODEL = "claude-sonnet-5";
const MAX_STEPS = 12;

export function chitsanoConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Run the agent loop from the given transcript until Chitsano produces a plain
 * answer or wants to perform a write action (which pauses as a proposal). Read
 * tools execute in-line; only one tool per turn (disable_parallel_tool_use).
 */
async function runLoop(messages: ChatMessage[]): Promise<ChitsanoTurn> {
  const client = getClient();
  if (!client) return { type: "unconfigured" };

  const work: ChatMessage[] = [...messages];

  for (let step = 0; step < MAX_STEPS; step++) {
    let res: Anthropic.Message;
    try {
      res = await client.messages.create({
        model: CHITSANO_MODEL,
        max_tokens: 2048,
        system: buildSystemPrompt(),
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        tools: ALL_TOOL_DEFS,
        tool_choice: { type: "auto", disable_parallel_tool_use: true },
        messages: work,
      } as Anthropic.MessageCreateParamsNonStreaming);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong talking to the AI service.";
      return { type: "error", text: msg, messages: work };
    }

    // Preserve the full assistant turn (thinking + text + tool_use) for replay.
    work.push({ role: "assistant", content: res.content });

    if (res.stop_reason === "refusal") {
      return { type: "message", text: "I'm not able to help with that one, sorry.", messages: work };
    }

    if (res.stop_reason !== "tool_use") {
      const text = extractText(res.content) || "I don't have anything to add.";
      return { type: "message", text, messages: work };
    }

    const toolUse = res.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) {
      return { type: "message", text: extractText(res.content) || "…", messages: work };
    }

    // Write tool → propose, do not execute. Pause the loop.
    const writeTool = WRITE_TOOLS[toolUse.name];
    if (writeTool) {
      try {
        const p = await writeTool.propose(toolUse.input as Record<string, unknown>);
        return {
          type: "proposal",
          text: extractText(res.content),
          proposal: { toolUseId: toolUse.id, action: toolUse.name, ...p },
          messages: work,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "That action could not be prepared.";
        work.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: toolUse.id, content: msg, is_error: true }],
        });
        continue;
      }
    }

    // Read tool → run and feed the result back.
    const readTool = READ_TOOLS[toolUse.name];
    let out: string;
    let isError = false;
    try {
      out = readTool
        ? await readTool.run(toolUse.input as Record<string, unknown>)
        : `Unknown tool: ${toolUse.name}`;
      if (!readTool) isError = true;
    } catch (e) {
      out = `Error running ${toolUse.name}: ${e instanceof Error ? e.message : "unknown error"}`;
      isError = true;
    }
    work.push({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUse.id, content: out || "(no data)", is_error: isError }],
    });
  }

  return {
    type: "message",
    text: "I've taken as many steps as I can on that one — try asking something more specific.",
    messages: work,
  };
}

/** Start (or continue) a conversation with a new user message. */
export async function runChitsano(messages: ChatMessage[]): Promise<ChitsanoTurn> {
  return runLoop(messages);
}

/**
 * Resume the loop after a proposed action was confirmed or declined. The write
 * itself is executed by the caller (actions/chitsano.ts) against the whitelist;
 * `resultText` is what the tool "returned" so the model can respond naturally.
 */
export async function continueAfterAction(
  messages: ChatMessage[],
  toolUseId: string,
  resultText: string,
  isError = false,
): Promise<ChitsanoTurn> {
  const work: ChatMessage[] = [
    ...messages,
    { role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, content: resultText, is_error: isError }] },
  ];
  return runLoop(work);
}
