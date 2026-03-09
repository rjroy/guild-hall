/**
 * Tool handler functions for the email toolbox.
 *
 * Each maker function accepts a JmapClient and returns an async handler
 * that produces a ToolResult. Handlers are pure: all JMAP interaction
 * goes through the injected client instance.
 */

import type { JmapClient } from "./jmap-client";
import { htmlToText } from "./html-to-text";
import type { ToolResult } from "@/daemon/types";

// -- Shared helpers --

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

// -- search_emails --

interface SearchEmailsArgs {
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  after?: string;
  before?: string;
  in_mailbox?: string;
  has_attachment?: boolean;
  limit?: number;
}

export function makeSearchEmailsHandler(client: JmapClient) {
  return async (args: SearchEmailsArgs): Promise<ToolResult> => {
    try {
      await client.ensureConnected();

      const filter: Record<string, unknown> = {};
      if (args.from) filter.from = args.from;
      if (args.to) filter.to = args.to;
      if (args.subject) filter.subject = args.subject;
      if (args.text) filter.text = args.text;
      if (args.after) filter.after = args.after;
      if (args.before) filter.before = args.before;
      if (args.has_attachment !== undefined)
        filter.hasAttachment = args.has_attachment;

      if (args.in_mailbox) {
        filter.inMailbox = client.resolveMailboxName(args.in_mailbox);
      }

      const limit = Math.min(args.limit ?? 20, 100);

      const response = await client.request([
        [
          "Email/query",
          {
            accountId: client.accountId,
            filter,
            sort: [{ property: "receivedAt", isAscending: false }],
            limit,
          },
          "query",
        ],
        [
          "Email/get",
          {
            accountId: client.accountId,
            properties: [
              "id",
              "threadId",
              "from",
              "to",
              "subject",
              "receivedAt",
              "preview",
              "hasAttachment",
              "keywords",
              "mailboxIds",
            ],
            "#ids": {
              resultOf: "query",
              name: "Email/query",
              path: "/ids/*",
            },
          },
          "details",
        ],
      ]);

      const emailData = response.methodResponses[1][1] as {
        list: Array<Record<string, unknown>>;
      };

      const emails = emailData.list.map((email) => ({
        id: email.id,
        threadId: email.threadId,
        from: email.from,
        to: email.to,
        subject: email.subject,
        receivedAt: email.receivedAt,
        preview: email.preview,
        hasAttachment: email.hasAttachment,
        isUnread: !(email.keywords as Record<string, boolean> | null)?.$seen,
        isFlagged: !!(email.keywords as Record<string, boolean> | null)?.$flagged,
        mailboxIds: email.mailboxIds,
      }));

      return textResult({ emails, total: emails.length });
    } catch (err) {
      return toToolError(err);
    }
  };
}

// -- read_email --

interface ReadEmailArgs {
  email_id: string;
}

export function makeReadEmailHandler(client: JmapClient) {
  return async (args: ReadEmailArgs): Promise<ToolResult> => {
    try {
      await client.ensureConnected();

      const response = await client.request([
        [
          "Email/get",
          {
            accountId: client.accountId,
            ids: [args.email_id],
            properties: [
              "id",
              "threadId",
              "from",
              "to",
              "cc",
              "replyTo",
              "subject",
              "sentAt",
              "receivedAt",
              "bodyValues",
              "textBody",
              "htmlBody",
              "attachments",
              "keywords",
              "mailboxIds",
            ],
            fetchTextBodyValues: true,
            fetchHTMLBodyValues: true,
            maxBodyValueBytes: 256000,
          },
          "email",
        ],
      ]);

      const emailData = response.methodResponses[0][1] as {
        list: Array<Record<string, unknown>>;
        notFound: string[];
      };

      if (emailData.list.length === 0) {
        return errorResult(
          `Email not found: ${args.email_id}`,
        );
      }

      const email = emailData.list[0];
      const bodyValues = (email.bodyValues ?? {}) as Record<
        string,
        { value: string }
      >;

      // Prefer text body, fall back to HTML converted to text
      let body = "";
      const textBody = email.textBody as Array<{ partId: string }> | undefined;
      const htmlBody = email.htmlBody as Array<{ partId: string }> | undefined;

      if (textBody && textBody.length > 0) {
        body = textBody
          .map((part) => bodyValues[part.partId]?.value ?? "")
          .join("\n");
      } else if (htmlBody && htmlBody.length > 0) {
        const htmlContent = htmlBody
          .map((part) => bodyValues[part.partId]?.value ?? "")
          .join("\n");
        body = htmlToText(htmlContent);
      }

      // Resolve mailbox IDs to names
      const mailboxIds = (email.mailboxIds ?? {}) as Record<string, boolean>;
      const mailboxNames = Object.keys(mailboxIds).map((id) =>
        client.resolveMailboxId(id),
      );

      // Build attachment metadata (no content)
      const attachments = (
        (email.attachments ?? []) as Array<Record<string, unknown>>
      ).map((att) => ({
        filename: att.name ?? att.filename ?? null,
        size: att.size ?? null,
        type: att.type ?? null,
      }));

      return textResult({
        id: email.id,
        threadId: email.threadId,
        from: email.from,
        to: email.to,
        cc: email.cc,
        replyTo: email.replyTo,
        subject: email.subject,
        sentAt: email.sentAt,
        receivedAt: email.receivedAt,
        isUnread: !(email.keywords as Record<string, boolean> | null)?.$seen,
        isFlagged: !!(email.keywords as Record<string, boolean> | null)?.$flagged,
        mailboxes: mailboxNames,
        body,
        attachments,
      });
    } catch (err) {
      return toToolError(err);
    }
  };
}

// -- list_mailboxes --

export function makeListMailboxesHandler(client: JmapClient) {
  return async (): Promise<ToolResult> => {
    try {
      await client.ensureConnected();
      return textResult({ mailboxes: client.mailboxes });
    } catch (err) {
      return toToolError(err);
    }
  };
}

// -- get_thread --

interface GetThreadArgs {
  thread_id: string;
}

export function makeGetThreadHandler(client: JmapClient) {
  return async (args: GetThreadArgs): Promise<ToolResult> => {
    try {
      await client.ensureConnected();

      const response = await client.request([
        [
          "Thread/get",
          { accountId: client.accountId, ids: [args.thread_id] },
          "thread",
        ],
        [
          "Email/get",
          {
            accountId: client.accountId,
            properties: [
              "id",
              "threadId",
              "from",
              "to",
              "subject",
              "receivedAt",
              "preview",
              "hasAttachment",
              "keywords",
              "mailboxIds",
            ],
            "#ids": {
              resultOf: "thread",
              name: "Thread/get",
              path: "/list/*/emailIds/*",
            },
          },
          "emails",
        ],
      ]);

      const threadData = response.methodResponses[0][1] as {
        list: Array<Record<string, unknown>>;
      };

      if (threadData.list.length === 0) {
        return errorResult(
          `Thread not found: ${args.thread_id}`,
        );
      }

      const emailData = response.methodResponses[1][1] as {
        list: Array<Record<string, unknown>>;
      };

      // Sort emails chronologically (ascending by receivedAt)
      const emails = emailData.list
        .map((email) => ({
          id: email.id,
          threadId: email.threadId,
          from: email.from,
          to: email.to,
          subject: email.subject,
          receivedAt: email.receivedAt,
          preview: email.preview,
          hasAttachment: email.hasAttachment,
          isUnread: !(email.keywords as Record<string, boolean> | null)?.$seen,
          isFlagged: !!(email.keywords as Record<string, boolean> | null)?.$flagged,
          mailboxIds: email.mailboxIds,
        }))
        .sort((a, b) => {
          const dateA = typeof a.receivedAt === "string" ? a.receivedAt : "";
          const dateB = typeof b.receivedAt === "string" ? b.receivedAt : "";
          return dateA.localeCompare(dateB);
        });

      return textResult({ threadId: args.thread_id, emails, total: emails.length });
    } catch (err) {
      return toToolError(err);
    }
  };
}
