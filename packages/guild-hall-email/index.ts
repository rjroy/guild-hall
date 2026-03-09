/**
 * Guild Hall Email Toolbox
 *
 * Read-only Fastmail inbox access via JMAP. Three initialization paths:
 *
 * 1. Unconfigured (REQ-EMT-13): FASTMAIL_API_TOKEN absent. All tools exist
 *    but return a configuration error.
 * 2. Connected: Token present, background connect kicks off. Tool handlers
 *    await connection via ensureConnected().
 * 3. Degraded (REQ-EMT-25): Token present but session fetch fails. Client
 *    retry logic handles one reconnect; if that fails, error propagates
 *    through tool error handling.
 */

import {
  createSdkMcpServer,
  tool,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod/v4";
import type { ToolResult } from "@/daemon/types";
import type { ToolboxFactory } from "@/daemon/services/toolbox-types";
import { JmapClient } from "./jmap-client";
import {
  makeSearchEmailsHandler,
  makeReadEmailHandler,
  makeListMailboxesHandler,
  makeGetThreadHandler,
} from "./tools";

// -- Unconfigured state helpers --

function makeUnconfiguredHandler(_toolName: string) {
  return (): Promise<ToolResult> =>
    Promise.resolve({
      content: [{
        type: "text",
        text: "Email toolbox is not configured. Set the FASTMAIL_API_TOKEN environment variable.",
      }],
      isError: true,
    });
}

function createUnconfiguredServer() {
  return createSdkMcpServer({
    name: "guild-hall-email",
    version: "0.1.0",
    tools: [
      tool(
        "search_emails",
        "Search for emails matching filter criteria. Returns email summaries sorted by date.",
        {
          from: z.string().optional().describe("Sender email address or name"),
          to: z.string().optional().describe("Recipient email address or name"),
          subject: z.string().optional().describe("Subject line text to match"),
          text: z.string().optional().describe("Full-text search across email content"),
          after: z.string().optional().describe("Only emails after this UTC datetime (ISO 8601)"),
          before: z.string().optional().describe("Only emails before this UTC datetime (ISO 8601)"),
          in_mailbox: z.string().optional().describe("Mailbox name to search within (e.g. 'Inbox', 'Sent')"),
          has_attachment: z.boolean().optional().describe("Filter to emails with/without attachments"),
          limit: z.number().optional().describe("Maximum results (default 20, max 100)"),
        },
        () => makeUnconfiguredHandler("search_emails")(),
      ),
      tool(
        "read_email",
        "Read the full content of a specific email by ID. Returns body text, metadata, and attachment info.",
        {
          email_id: z.string().describe("The email ID from a search_emails result"),
        },
        () => makeUnconfiguredHandler("read_email")(),
      ),
      tool(
        "list_mailboxes",
        "List all mailboxes (folders) in the email account with message counts and roles.",
        {},
        () => makeUnconfiguredHandler("list_mailboxes")(),
      ),
      tool(
        "get_thread",
        "Get all emails in a conversation thread, sorted chronologically.",
        {
          thread_id: z.string().describe("The thread ID from a search_emails or read_email result"),
        },
        () => makeUnconfiguredHandler("get_thread")(),
      ),
    ],
  });
}

// -- Connected state --

function createConfiguredServer(client: JmapClient) {
  const searchHandler = makeSearchEmailsHandler(client);
  const readHandler = makeReadEmailHandler(client);
  const listHandler = makeListMailboxesHandler(client);
  const threadHandler = makeGetThreadHandler(client);

  return createSdkMcpServer({
    name: "guild-hall-email",
    version: "0.1.0",
    tools: [
      tool(
        "search_emails",
        "Search for emails matching filter criteria. Returns email summaries sorted by date.",
        {
          from: z.string().optional().describe("Sender email address or name"),
          to: z.string().optional().describe("Recipient email address or name"),
          subject: z.string().optional().describe("Subject line text to match"),
          text: z.string().optional().describe("Full-text search across email content"),
          after: z.string().optional().describe("Only emails after this UTC datetime (ISO 8601)"),
          before: z.string().optional().describe("Only emails before this UTC datetime (ISO 8601)"),
          in_mailbox: z.string().optional().describe("Mailbox name to search within (e.g. 'Inbox', 'Sent')"),
          has_attachment: z.boolean().optional().describe("Filter to emails with/without attachments"),
          limit: z.number().optional().describe("Maximum results (default 20, max 100)"),
        },
        (args) => searchHandler(args),
      ),
      tool(
        "read_email",
        "Read the full content of a specific email by ID. Returns body text, metadata, and attachment info.",
        {
          email_id: z.string().describe("The email ID from a search_emails result"),
        },
        (args) => readHandler(args),
      ),
      tool(
        "list_mailboxes",
        "List all mailboxes (folders) in the email account with message counts and roles.",
        {},
        () => listHandler(),
      ),
      tool(
        "get_thread",
        "Get all emails in a conversation thread, sorted chronologically.",
        {
          thread_id: z.string().describe("The thread ID from a search_emails or read_email result"),
        },
        (args) => threadHandler(args),
      ),
    ],
  });
}

// -- Factory --

/**
 * ToolboxFactory for the email toolbox. Reads FASTMAIL_API_TOKEN from
 * process.env. Does not emit EventBus events (read-only operations).
 */
export const toolboxFactory: ToolboxFactory = () => {
  const token = process.env.FASTMAIL_API_TOKEN;

  if (!token) {
    return { server: createUnconfiguredServer() };
  }

  const sessionUrl = process.env.FASTMAIL_SESSION_URL || undefined;
  const client = new JmapClient(token, sessionUrl);

  // Kick off background connection. The promise is stored in the client;
  // tool handlers call ensureConnected() which awaits it.
  void client.ensureConnected();

  return { server: createConfiguredServer(client) };
};
