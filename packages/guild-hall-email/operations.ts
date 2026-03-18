/**
 * REST operation factory for the email package.
 *
 * Wraps core functions in PackageOperation objects for daemon REST routes.
 * Domain logic lives in core.ts; this file handles HTTP serialization
 * and error mapping.
 */

import { z } from "zod/v4";
import { JmapClient } from "./jmap-client";
import {
  searchEmails,
  readEmail,
  listMailboxes,
  getThread,
} from "./core";
import type {
  OperationFactory,
  PackageOperation,
} from "@/daemon/services/operation-types";
import { OperationHandlerError } from "@/daemon/services/operation-types";
import type { OperationDefinition } from "@/lib/types";

// -- Zod request schemas (Step 5) --

const searchEmailsSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  in_mailbox: z.string().optional(),
  has_attachment: z.boolean().optional(),
  limit: z.number().optional(),
});

const readEmailSchema = z.object({
  email_id: z.string(),
});

const listMailboxesSchema = z.object({});

const getThreadSchema = z.object({
  thread_id: z.string(),
});

// -- Error mapping --

function toOperationError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);

  if (message.includes("401") || message.includes("Unauthorized")) {
    throw new OperationHandlerError(
      "Email authentication failed. Check FASTMAIL_API_TOKEN.",
      401,
    );
  }

  if (message.includes("not found")) {
    throw new OperationHandlerError(message, 404);
  }

  throw new OperationHandlerError(message, 500);
}

// -- Factory --

export const operationFactory: OperationFactory = () => {
  const token = process.env.FASTMAIL_API_TOKEN;

  if (!token) {
    return { operations: [] };
  }

  const sessionUrl = process.env.FASTMAIL_SESSION_URL || undefined;
  const client = new JmapClient(token, sessionUrl);
  void client.ensureConnected().catch(() => {});

  const operations: PackageOperation[] = [
    {
      definition: {
        operationId: "email.inbox.search",
        version: "1",
        name: "search",
        description: "Search for emails matching filter criteria.",
        invocation: { method: "POST", path: "/email/inbox/search" },
        requestSchema: searchEmailsSchema,
        sideEffects: "",
        context: {},
        idempotent: true,
        hierarchy: { root: "email", feature: "inbox" },
      } satisfies OperationDefinition,
      handler: async (ctx) => {
        try {
          const data = await searchEmails(client, ctx.params as Parameters<typeof searchEmails>[1]);
          return { data };
        } catch (err) {
          toOperationError(err);
        }
      },
    },
    {
      definition: {
        operationId: "email.inbox.read",
        version: "1",
        name: "read",
        description: "Read the full content of a specific email by ID.",
        invocation: { method: "GET", path: "/email/inbox/read" },
        requestSchema: readEmailSchema,
        sideEffects: "",
        context: {},
        idempotent: true,
        hierarchy: { root: "email", feature: "inbox" },
        parameters: [{ name: "email_id", required: true, in: "query" }],
      } satisfies OperationDefinition,
      handler: async (ctx) => {
        try {
          const data = await readEmail(client, ctx.params.email_id as string);
          return { data };
        } catch (err) {
          toOperationError(err);
        }
      },
    },
    {
      definition: {
        operationId: "email.inbox.mailboxes",
        version: "1",
        name: "mailboxes",
        description: "List all mailboxes (folders) in the email account.",
        invocation: { method: "GET", path: "/email/inbox/mailboxes" },
        requestSchema: listMailboxesSchema,
        sideEffects: "",
        context: {},
        idempotent: true,
        hierarchy: { root: "email", feature: "inbox" },
      } satisfies OperationDefinition,
      handler: async () => {
        try {
          const data = await listMailboxes(client);
          return { data };
        } catch (err) {
          toOperationError(err);
        }
      },
    },
    {
      definition: {
        operationId: "email.inbox.thread",
        version: "1",
        name: "thread",
        description: "Get all emails in a conversation thread, sorted chronologically.",
        invocation: { method: "GET", path: "/email/inbox/thread" },
        requestSchema: getThreadSchema,
        sideEffects: "",
        context: {},
        idempotent: true,
        hierarchy: { root: "email", feature: "inbox" },
        parameters: [{ name: "thread_id", required: true, in: "query" }],
      } satisfies OperationDefinition,
      handler: async (ctx) => {
        try {
          const data = await getThread(client, ctx.params.thread_id as string);
          return { data };
        } catch (err) {
          toOperationError(err);
        }
      },
    },
  ];

  return { operations };
};
