#!/usr/bin/env bun
import * as path from "node:path";
import {
  daemonFetch as realDaemonFetch,
  isDaemonError,
} from "@/lib/daemon-client";
import type { DaemonError } from "@/lib/daemon-client";
import type { OperationParameter } from "@/lib/types";
import { migrateContentToBody } from "./migrate-content-to-body";
import {
  buildBody,
  buildCliOperation,
  buildQueryString,
  resolveCommand,
  validateArgs,
  type AggregateCommand,
  type CliOperation,
  type LeafCommand,
  type LocalCommand,
  type OperationsRegistryView,
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
import { findNodeByPath } from "./surface-utils";
import {
  formatActionConfirmation,
  getCommissionFormatter,
  isCommissionAction,
} from "./commission-format";

export type { OperationsRegistryView } from "./resolve";

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

/**
 * Fetch JSON from the daemon or exit 1 with a diagnostic. The aggregate
 * dispatcher issues several requests in sequence, so the repeated error
 * unwrap lives here rather than inline.
 */
async function fetchJsonOrExit(
  deps: CliDeps,
  requestPath: string,
  method: "GET" | "POST",
): Promise<Record<string, unknown>> {
  const res = await deps.daemonFetch(requestPath, { method });
  if (isDaemonError(res)) {
    console.error(`Failed to reach daemon: ${res.message}`);
    process.exit(1);
  }
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = body as { error?: string };
    console.error(errObj.error ?? `Request failed (HTTP ${res.status})`);
    process.exit(1);
  }
  return body;
}

async function dispatchAggregate(
  command: AggregateCommand,
  flags: Record<string, string | boolean>,
  jsonMode: boolean,
  deps: CliDeps,
): Promise<void> {
  // Only the meeting list aggregate exists today (REQ-CLI-AGENT-10a).
  // m-2: look up each constituent by operationId so the dispatcher uses the
  // resolved invocation.path — never a hardcoded literal.
  const byId = new Map(command.operations.map((o) => [o.operationId, o]));
  const requestedOp = byId.get("meeting.request.meeting.list");
  const sessionOp = byId.get("meeting.session.meeting.list");

  if (!requestedOp || !sessionOp) {
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

  const includeRequested = stateFilter === "all" || stateFilter === "requested";
  const includeActive = stateFilter === "all" || stateFilter === "active";

  const requested: Array<Record<string, unknown>> = [];
  const active: Array<Record<string, unknown>> = [];

  // M-1: `meeting.request.meeting.list` is scoped to a single project. When
  // the caller omits `--projectName` we fan out across every registered
  // project so the agent-level view ("meeting list [--state requested|active|all]")
  // is project-agnostic as the plan intends.
  if (includeRequested) {
    let projectNames: string[];
    if (projectName !== undefined) {
      projectNames = [projectName];
    } else {
      const listBody = await fetchJsonOrExit(
        deps,
        "/system/config/project/list",
        "GET",
      );
      const projects = Array.isArray(listBody.projects)
        ? (listBody.projects as Array<Record<string, unknown>>)
        : [];
      projectNames = projects
        .map((p) => (typeof p.name === "string" ? p.name : ""))
        .filter((n) => n.length > 0);
    }

    for (const pn of projectNames) {
      const requestPath = `${requestedOp.invocation.path}?projectName=${encodeURIComponent(pn)}`;
      const body = await fetchJsonOrExit(deps, requestPath, "GET");
      const meetings = body.meetings;
      if (Array.isArray(meetings)) {
        for (const m of meetings as Array<Record<string, unknown>>) {
          requested.push(m);
        }
      }
    }
  }

  if (includeActive) {
    const body = await fetchJsonOrExit(deps, sessionOp.invocation.path, "GET");
    const sessions = body.sessions;
    if (Array.isArray(sessions)) {
      for (const s of sessions as Array<Record<string, unknown>>) {
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
    operation = buildCliOperation(targetOperationId, {
      registry: deps.operationsRegistry,
    });
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

/**
 * Dispatch a LOCAL_COMMAND_SENTINEL leaf. Local commands run entirely
 * in-process and never touch the daemon; they're routed by leaf name so
 * additions to `CLI_SURFACE` pick up dispatch automatically.
 */
async function dispatchLocal(
  command: LocalCommand,
  flags: Record<string, string | boolean>,
): Promise<void> {
  switch (command.leaf.name) {
    case "migrate-content": {
      const apply = flags.apply === true;
      const exitCode = await migrateContentToBody(apply);
      process.exit(exitCode);
    }
  }
  console.error(`Unknown local command: ${command.leaf.name}`);
  process.exit(1);
}

export async function runCli(argv: string[], deps: CliDeps): Promise<void> {
  const { segments, options, flags } = extractFlags(argv);
  const jsonMode = shouldOutputJson(options);
  const surface = deps.surface ?? CLI_SURFACE;

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
      if (cmd.type === "local") {
        await dispatchLocal(cmd, flags);
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
