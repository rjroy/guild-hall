#!/usr/bin/env bun
import * as path from "node:path";
import {
  daemonFetch as realDaemonFetch,
  isDaemonError,
} from "@/lib/daemon-client";
import type { DaemonError } from "@/lib/daemon-client";
import type { OperationDefinition, OperationParameter } from "@/lib/types";
import { migrateContentToBody } from "./migrate-content-to-body";
import {
  buildBody,
  buildQueryString,
  resolveCommand,
  validateArgs,
  type AggregateCommand,
  type CliOperation,
  type LeafCommand,
  type PackageOpCommand,
} from "./resolve";
import {
  extractFlags,
  formatResponse,
  shouldOutputJson,
  suggestCommand,
} from "./format";
import { renderHelp } from "./help";
import { streamOperation as realStreamOperation } from "./stream";
import { CLI_SURFACE, type CliGroupNode } from "./surface";
import { findNodeByPath, invocationForOperation } from "./surface-utils";
import {
  formatActionConfirmation,
  getCommissionFormatter,
  isCommissionAction,
} from "./commission-format";

/**
 * Minimal view of the daemon operations registry the CLI needs in-process
 * (optional — only set in tests or when the daemon runs in the same process).
 * In production the CLI has no registry and falls back to inference via
 * `invocationForOperation()`.
 */
export interface OperationsRegistryView {
  get(operationId: string): OperationDefinition | undefined;
}

export interface CliDeps {
  daemonFetch: (
    requestPath: string,
    options?: { method?: string; body?: string },
  ) => Promise<Response | DaemonError>;
  streamOperation: (path: string, body?: string) => Promise<void>;
  surface?: CliGroupNode;
  operationsRegistry?: OperationsRegistryView;
  readStdin?: () => Promise<string>;
}

async function defaultReadStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Resolve a CliOperation for a concrete operationId. Uses the registry when
 * available for accurate parameter metadata; otherwise infers method/path
 * from the operationId.
 */
function operationFor(
  operationId: string,
  registry: OperationsRegistryView | undefined,
): CliOperation {
  const fromRegistry = registry?.get(operationId);
  if (fromRegistry) {
    return {
      operationId,
      invocation: {
        method: fromRegistry.invocation.method,
        path: fromRegistry.invocation.path,
      },
      streaming: fromRegistry.streaming,
      parameters: fromRegistry.parameters,
    };
  }
  const inv = invocationForOperation(operationId);
  return {
    operationId,
    invocation: { method: inv.method, path: inv.path },
    streaming: inv.streaming,
  };
}

/**
 * Replaces a literal "-" positional arg with stdin contents (REQ-QAI-22).
 */
async function substituteStdin(
  args: string[],
  readStdin: () => Promise<string>,
): Promise<string[]> {
  const hyphenIndex = args.indexOf("-");
  if (hyphenIndex < 0) return args;
  const stdinContent = await readStdin();
  const next = [...args];
  next[hyphenIndex] = stdinContent;
  return next;
}

/**
 * Resolves a potential filesystem path positional arg for commands that
 * need it (currently only `system.config.project.register`).
 */
function maybeResolveRegisterPath(
  op: CliOperation,
  positionalArgs: string[],
): string[] {
  if (op.operationId !== "system.config.project.register") return positionalArgs;
  if (positionalArgs.length < 2) return positionalArgs;
  return [
    positionalArgs[0],
    path.resolve(positionalArgs[1]),
    ...positionalArgs.slice(2),
  ];
}

async function dispatchLeaf(
  command: LeafCommand,
  flags: Record<string, string | boolean>,
  jsonMode: boolean,
  deps: CliDeps,
): Promise<void> {
  const { operation, positionalArgs } = command;

  const resolvedArgs = maybeResolveRegisterPath(operation, positionalArgs);

  const error = validateArgs(operation, resolvedArgs);
  if (error) {
    console.error(error);
    process.exit(1);
  }

  const finalArgs = await substituteStdin(
    resolvedArgs,
    deps.readStdin ?? defaultReadStdin,
  );

  if (operation.streaming) {
    const body = buildBody(operation, finalArgs, flags);
    await deps.streamOperation(operation.invocation.path, body);
    return;
  }

  const isGet = operation.invocation.method === "GET";
  const requestPath = isGet
    ? `${operation.invocation.path}${buildQueryString(operation, finalArgs)}`
    : operation.invocation.path;

  const result = await deps.daemonFetch(requestPath, {
    method: operation.invocation.method,
    body: isGet ? undefined : buildBody(operation, finalArgs, flags),
  });

  if (isDaemonError(result)) {
    console.error(`Failed to reach daemon: ${result.message}`);
    process.exit(1);
  }

  const data: unknown = await result.json();

  if (!result.ok) {
    const errObj = data as { error?: string };
    console.error(errObj.error ?? `Request failed (HTTP ${result.status})`);
    process.exit(1);
  }

  if (!jsonMode) {
    const customFormatter = getCommissionFormatter(operation.operationId);
    if (customFormatter) {
      console.log(customFormatter(data));
      return;
    }
    if (isCommissionAction(operation.operationId)) {
      console.log(formatActionConfirmation(data, operation, positionalArgs));
      return;
    }
  }
  console.log(formatResponse(data, jsonMode));
}

interface AggregateMeeting {
  meetingId: string;
  projectName: string;
  worker: string;
  status: string;
  /** Kept as provided. Empty string means "unknown start" (m-4). */
  startedAt: string;
  source: "requested" | "active";
}

/**
 * Merges requested meetings and active sessions into a single list.
 *
 * m-4 handling: rows with empty `startedAt` (malformed or missing meeting-id
 * timestamps) are kept but sorted after all dated rows, preserving observability
 * without rendering them as "1970-01-01" or breaking ISO-date sorting.
 */
export function mergeMeetingAggregate(
  requested: Array<Record<string, unknown>>,
  active: Array<Record<string, unknown>>,
  stateFilter: string,
): AggregateMeeting[] {
  const out: AggregateMeeting[] = [];

  const includeRequested = stateFilter === "all" || stateFilter === "requested";
  const includeActive = stateFilter === "all" || stateFilter === "active";

  const asString = (v: unknown): string => (typeof v === "string" ? v : "");
  const firstString = (...vs: unknown[]): string => {
    for (const v of vs) {
      if (typeof v === "string" && v.length > 0) return v;
    }
    return "";
  };

  if (includeRequested) {
    for (const m of requested) {
      out.push({
        meetingId: asString(m.meetingId),
        projectName: asString(m.projectName),
        worker: firstString(m.worker, m.workerName),
        status: asString(m.status),
        startedAt: asString(m.date),
        source: "requested",
      });
    }
  }

  if (includeActive) {
    for (const s of active) {
      out.push({
        meetingId: asString(s.meetingId),
        projectName: asString(s.projectName),
        worker: firstString(s.workerName, s.worker),
        status: asString(s.status),
        startedAt: asString(s.startedAt),
        source: "active",
      });
    }
  }

  // m-4: push empty startedAt rows to the end; sort the rest descending.
  out.sort((a, b) => {
    if (!a.startedAt && !b.startedAt) return 0;
    if (!a.startedAt) return 1;
    if (!b.startedAt) return -1;
    return b.startedAt.localeCompare(a.startedAt);
  });

  return out;
}

function formatAggregateMeetingList(rows: AggregateMeeting[]): string {
  if (rows.length === 0) return "(no meetings)";
  const display = rows.map((r) => ({
    meetingId: r.meetingId,
    projectName: r.projectName,
    worker: r.worker,
    status: r.status,
    // m-4: show explicit placeholder instead of an empty column.
    startedAt: r.startedAt === "" ? "(unknown)" : r.startedAt,
    source: r.source,
  }));
  return formatResponse(display, false);
}

async function dispatchAggregate(
  command: AggregateCommand,
  flags: Record<string, string | boolean>,
  jsonMode: boolean,
  deps: CliDeps,
): Promise<void> {
  // Only the meeting list aggregate exists today (REQ-CLI-AGENT-10a).
  const opIds = command.operations.map((o) => o.operationId).sort();
  const isMeetingList =
    opIds.includes("meeting.request.meeting.list") &&
    opIds.includes("meeting.session.meeting.list");

  if (!isMeetingList) {
    console.error(
      `Unsupported aggregate: ${command.operations.map((o) => o.operationId).join(", ")}`,
    );
    process.exit(1);
  }

  const stateFlag = flags.state;
  const stateFilter = typeof stateFlag === "string" ? stateFlag : "all";
  if (!["all", "requested", "active"].includes(stateFilter)) {
    console.error(`Invalid --state value: ${stateFilter} (expected: all | requested | active)`);
    process.exit(1);
  }

  const projectNameFlag = flags.projectName;
  const projectName =
    typeof projectNameFlag === "string" ? projectNameFlag : undefined;

  const requested: Array<Record<string, unknown>> = [];
  const active: Array<Record<string, unknown>> = [];

  // Fan out. `meeting.request.meeting.list` requires projectName; skip when
  // the caller has not supplied one.
  if (
    (stateFilter === "all" || stateFilter === "requested") &&
    projectName !== undefined
  ) {
    const query = `?projectName=${encodeURIComponent(projectName)}`;
    const res = await deps.daemonFetch(
      `/meeting/request/meeting/list${query}`,
      { method: "GET" },
    );
    if (isDaemonError(res)) {
      console.error(`Failed to reach daemon: ${res.message}`);
      process.exit(1);
    }
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      console.error(
        err.error ?? `Request failed (HTTP ${res.status})`,
      );
      process.exit(1);
    }
    const body = (await res.json()) as {
      meetings?: Array<Record<string, unknown>>;
    };
    if (Array.isArray(body.meetings)) {
      for (const m of body.meetings) {
        requested.push(m);
      }
    }
  }

  if (stateFilter === "all" || stateFilter === "active") {
    const res = await deps.daemonFetch(
      "/meeting/session/meeting/list",
      { method: "GET" },
    );
    if (isDaemonError(res)) {
      console.error(`Failed to reach daemon: ${res.message}`);
      process.exit(1);
    }
    if (!res.ok) {
      const err = (await res.json()) as { error?: string };
      console.error(
        err.error ?? `Request failed (HTTP ${res.status})`,
      );
      process.exit(1);
    }
    const body = (await res.json()) as {
      sessions?: Array<Record<string, unknown>>;
    };
    if (Array.isArray(body.sessions)) {
      for (const s of body.sessions) {
        active.push(s);
      }
    }
  }

  const merged = mergeMeetingAggregate(requested, active, stateFilter);

  if (jsonMode) {
    console.log(JSON.stringify({ meetings: merged }, null, 2));
    return;
  }
  console.log(formatAggregateMeetingList(merged));
}

async function dispatchPackageOp(
  command: PackageOpCommand,
  flags: Record<string, string | boolean>,
  jsonMode: boolean,
  deps: CliDeps,
): Promise<void> {
  const { targetOperationId, positionalArgs } = command;

  let operation: CliOperation;
  try {
    operation = operationFor(targetOperationId, deps.operationsRegistry);
  } catch (err: unknown) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // If the registry knows about this op and exposes parameters, use them.
  // Otherwise treat the call as positional-empty and forward flags only.
  const parameters: OperationParameter[] =
    operation.parameters ??
    (operation.invocation.method === "GET"
      ? positionalArgs.map((_, i) => ({
          name: `arg${i}`,
          required: false,
          in: "query" as const,
        }))
      : positionalArgs.map((_, i) => ({
          name: `arg${i}`,
          required: false,
          in: "body" as const,
        })));

  const opWithParams: CliOperation = { ...operation, parameters };

  const finalArgs = await substituteStdin(
    positionalArgs,
    deps.readStdin ?? defaultReadStdin,
  );

  if (opWithParams.streaming) {
    const body = buildBody(opWithParams, finalArgs, flags);
    await deps.streamOperation(opWithParams.invocation.path, body);
    return;
  }

  const isGet = opWithParams.invocation.method === "GET";
  const requestPath = isGet
    ? `${opWithParams.invocation.path}${buildQueryString(opWithParams, finalArgs)}`
    : opWithParams.invocation.path;

  const result = await deps.daemonFetch(requestPath, {
    method: opWithParams.invocation.method,
    body: isGet ? undefined : buildBody(opWithParams, finalArgs, flags),
  });

  if (isDaemonError(result)) {
    console.error(`Failed to reach daemon: ${result.message}`);
    process.exit(1);
  }

  const data: unknown = await result.json();

  if (!result.ok) {
    const errObj = data as { error?: string };
    console.error(errObj.error ?? `Request failed (HTTP ${result.status})`);
    process.exit(1);
  }

  console.log(formatResponse(data, jsonMode));
}

export async function runCli(argv: string[], deps: CliDeps): Promise<void> {
  const { segments, options, flags } = extractFlags(argv);
  const jsonMode = shouldOutputJson(options);
  const surface = deps.surface ?? CLI_SURFACE;

  // Local-only command that doesn't touch the daemon.
  if (segments[0] === "migrate-content") {
    const applyFlag = argv.includes("--apply");
    const exitCode = await migrateContentToBody(applyFlag);
    process.exit(exitCode);
  }

  const resolved = resolveCommand(segments, surface, flags);

  switch (resolved.type) {
    case "help": {
      const { segments: helpSegments, node } = resolved.help;
      const target = node ?? findNodeByPath(helpSegments, surface) ?? surface;
      const rendered = renderHelp(target, helpSegments);
      console.log(jsonMode ? JSON.stringify(rendered.json, null, 2) : rendered.text);
      return;
    }

    case "unknown": {
      const suggestion = suggestCommand(resolved.segments, surface);
      const msg = `Unknown command: ${resolved.segments.join(" ")}`;
      if (suggestion) {
        console.error(`${msg}\n\nDid you mean: guild-hall ${suggestion}?`);
      } else {
        console.error(
          `${msg}\n\nRun 'guild-hall help' to see available commands.`,
        );
      }
      process.exit(1);
      return;
    }

    case "command": {
      const cmd = resolved.command;
      if (cmd.type === "leaf") {
        await dispatchLeaf(cmd, flags, jsonMode, deps);
        return;
      }
      if (cmd.type === "aggregate") {
        await dispatchAggregate(cmd, flags, jsonMode, deps);
        return;
      }
      if (cmd.type === "package-op") {
        await dispatchPackageOp(cmd, flags, jsonMode, deps);
        return;
      }
    }
  }
}

async function main(): Promise<void> {
  await runCli(process.argv.slice(2), {
    daemonFetch: realDaemonFetch,
    streamOperation: realStreamOperation,
  });
}

// Only auto-run when executed directly (not when imported in tests).
if (import.meta.main) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
