/**
 * MCP tool handler wrappers for the email toolbox.
 *
 * Each maker function accepts a JmapClient and returns an async handler
 * that produces a ToolResult. Domain logic lives in core.ts; these
 * wrappers handle MCP serialization and error formatting.
 */

import type { JmapClient } from "./jmap-client";
import type { ToolResult } from "@/daemon/types";
import {
  searchEmails,
  readEmail,
  listMailboxes,
  getThread,
} from "./core";
import type { SearchEmailsArgs } from "./core";

// -- MCP helpers --

function textResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

/**
 * Wraps error messages for tool consumers. Auth failures get a specific
 * message pointing at the token. Everything else gets the error's own
 * message without leaking internals like stack traces or token values.
 */
function toToolError(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes("401") || message.includes("Unauthorized")) {
    return errorResult(
      "Email toolbox authentication failed. Check FASTMAIL_API_TOKEN.",
    );
  }

  return errorResult(message);
}

// -- Tool handlers --

export function makeSearchEmailsHandler(client: JmapClient) {
  return async (args: SearchEmailsArgs): Promise<ToolResult> => {
    try {
      const result = await searchEmails(client, args);
      return textResult(result);
    } catch (err) {
      return toToolError(err);
    }
  };
}

export function makeReadEmailHandler(client: JmapClient) {
  return async (args: { email_id: string }): Promise<ToolResult> => {
    try {
      const result = await readEmail(client, args.email_id);
      return textResult(result);
    } catch (err) {
      return toToolError(err);
    }
  };
}

export function makeListMailboxesHandler(client: JmapClient) {
  return async (): Promise<ToolResult> => {
    try {
      const result = await listMailboxes(client);
      return textResult(result);
    } catch (err) {
      return toToolError(err);
    }
  };
}

export function makeGetThreadHandler(client: JmapClient) {
  return async (args: { thread_id: string }): Promise<ToolResult> => {
    try {
      const result = await getThread(client, args.thread_id);
      return textResult(result);
    } catch (err) {
      return toToolError(err);
    }
  };
}
