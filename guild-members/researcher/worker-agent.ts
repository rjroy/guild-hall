/**
 * Worker Agent Spawn.
 *
 * Runs an Agent SDK session for a single worker dispatch job. The agent
 * gets read-only built-in tools plus the internal MCP server for progress
 * reporting, decision logging, and memory storage.
 *
 * Follows the DI pattern: queryFn is injected so tests can provide a mock
 * async generator instead of calling the real Agent SDK.
 */

import type { McpSdkServerConfigWithInstance } from "@anthropic-ai/claude-agent-sdk";
import type { QueryFn } from "../../lib/agent.js";

// -- Type guard --

/**
 * Type guard for SDK success result messages.
 * Local to avoid cross-compilation-context imports (same pattern as memory.ts).
 */
function isSuccessResult(
  msg: unknown,
): msg is { type: "result"; subtype: "success"; result: string } {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    (msg as Record<string, unknown>).type === "result" &&
    "subtype" in msg &&
    (msg as Record<string, unknown>).subtype === "success" &&
    "result" in msg &&
    typeof (msg as Record<string, unknown>).result === "string"
  );
}

// -- Constants --

const DEFAULT_MAX_TURNS = 150;
const DEFAULT_MAX_BUDGET_USD = 0.5;

const AGENT_TOOLS = ["Read", "Write", "Edit", "Grep", "Glob", "WebSearch", "WebFetch"];

// -- Worker agent --

/**
 * Spawn a worker agent session for a dispatch job.
 *
 * Iterates the query generator to completion, extracting the result text
 * from the success message. Throws if the agent fails (the caller's
 * .catch() handles the error).
 *
 * @param task - The task prompt to send to the agent.
 * @param systemPrompt - The constructed system prompt (from buildWorkerPrompt).
 * @param internalTools - The in-process MCP server providing worker tools.
 * @param config - Optional dispatch config with maxTurns/maxBudgetUsd overrides.
 * @param queryFn - Injected query function (real SDK or test mock).
 * @param abortController - Controller for cancellation from the cancel handler.
 * @returns The agent's final result text.
 */
export async function spawnWorkerAgent(
  task: string,
  systemPrompt: string,
  internalTools: McpSdkServerConfigWithInstance,
  config: Record<string, unknown> | undefined,
  queryFn: QueryFn,
  abortController: AbortController,
): Promise<string> {
  const maxTurns = typeof config?.maxTurns === "number"
    ? config.maxTurns
    : DEFAULT_MAX_TURNS;

  const maxBudgetUsd = typeof config?.maxBudgetUsd === "number"
    ? config.maxBudgetUsd
    : DEFAULT_MAX_BUDGET_USD;

  const q = queryFn({
    prompt: task,
    options: {
      systemPrompt,
      mcpServers: {
        "worker-internal": internalTools,
      },
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
      tools: AGENT_TOOLS,
      maxTurns,
      maxBudgetUsd,
      settingSources: [],
      persistSession: false,
      abortController,
    },
  });

  let resultText = "";
  let turnCount = 0;
  for await (const msg of q) {
    if (isSuccessResult(msg)) {
      resultText = msg.result;
    }
    // Count assistant messages as turns for logging
    if (typeof msg === "object" && msg !== null && "type" in msg) {
      const msgType = (msg as Record<string, unknown>).type;
      if (msgType === "assistant") {
        turnCount++;
      }
    }
  }

  if (resultText) {
    console.log(`[worker-agent] Agent completed with success result (${turnCount} turns)`);
  } else {
    console.log(`[worker-agent] Agent completed without success result (${turnCount} turns). submit_result may have stored output directly.`);
  }

  return resultText;
}
