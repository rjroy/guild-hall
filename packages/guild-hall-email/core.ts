/**
 * Core email domain functions.
 *
 * Pure JMAP orchestration and data formatting. No MCP types, no REST types.
 * Adapters in tools.ts and operations.ts wrap these for their respective
 * consumers.
 */

import type { JmapClient, Mailbox } from "./jmap-client";
import { htmlToText } from "./html-to-text";

// -- Domain types --

export interface EmailSummary {
  id: unknown;
  threadId: unknown;
  from: unknown;
  to: unknown;
  subject: unknown;
  receivedAt: unknown;
  preview: unknown;
  hasAttachment: unknown;
  isUnread: boolean;
  isFlagged: boolean;
  mailboxIds: unknown;
}

export interface EmailDetail {
  id: unknown;
  threadId: unknown;
  from: unknown;
  to: unknown;
  cc: unknown;
  replyTo: unknown;
  subject: unknown;
  sentAt: unknown;
  receivedAt: unknown;
  isUnread: boolean;
  isFlagged: boolean;
  mailboxes: string[];
  body: string;
  attachments: Array<{
    filename: unknown;
    size: unknown;
    type: unknown;
  }>;
}

export interface SearchEmailsArgs {
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

// -- Core functions --

function mapEmailSummary(email: Record<string, unknown>): EmailSummary {
  return {
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
  };
}

export async function searchEmails(
  client: JmapClient,
  args: SearchEmailsArgs,
): Promise<{ emails: EmailSummary[]; total: number }> {
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

  const emails = emailData.list.map(mapEmailSummary);
  return { emails, total: emails.length };
}

export async function readEmail(
  client: JmapClient,
  emailId: string,
): Promise<EmailDetail> {
  await client.ensureConnected();

  const response = await client.request([
    [
      "Email/get",
      {
        accountId: client.accountId,
        ids: [emailId],
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
    throw new Error(`Email not found: ${emailId}`);
  }

  const email = emailData.list[0];
  const bodyValues = (email.bodyValues ?? {}) as Record<
    string,
    { value: string }
  >;

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

  const mailboxIds = (email.mailboxIds ?? {}) as Record<string, boolean>;
  const mailboxNames = Object.keys(mailboxIds).map((id) =>
    client.resolveMailboxId(id),
  );

  const attachments = (
    (email.attachments ?? []) as Array<Record<string, unknown>>
  ).map((att) => ({
    filename: att.name ?? att.filename ?? null,
    size: att.size ?? null,
    type: att.type ?? null,
  }));

  return {
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
  };
}

export async function listMailboxes(
  client: JmapClient,
): Promise<{ mailboxes: Mailbox[] }> {
  await client.ensureConnected();
  return { mailboxes: client.mailboxes };
}

export async function getThread(
  client: JmapClient,
  threadId: string,
): Promise<{ threadId: string; emails: EmailSummary[]; total: number }> {
  await client.ensureConnected();

  const response = await client.request([
    [
      "Thread/get",
      { accountId: client.accountId, ids: [threadId] },
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
    throw new Error(`Thread not found: ${threadId}`);
  }

  const emailData = response.methodResponses[1][1] as {
    list: Array<Record<string, unknown>>;
  };

  const emails = emailData.list
    .map(mapEmailSummary)
    .sort((a, b) => {
      const dateA = typeof a.receivedAt === "string" ? a.receivedAt : "";
      const dateB = typeof b.receivedAt === "string" ? b.receivedAt : "";
      return dateA.localeCompare(dateB);
    });

  return { threadId, emails, total: emails.length };
}
