import type { OperationDefinition, OperationParameter } from "@/lib/types";
import {
  AGGREGATE_SENTINEL,
  CLI_SURFACE,
  LOCAL_COMMAND_SENTINEL,
  PACKAGE_OP_SENTINEL,
  type CliGroupNode,
  type CliLeafNode,
  type CliNode,
} from "./surface";

/**
 * Minimal view of the daemon operations registry the CLI consults when
 * resolving a concrete operationId into parameters. Optional — only wired in
 * tests or when the daemon and CLI share a process. Declared here (rather
 * than in `./index.ts`) to keep the single `buildCliOperation` helper cycle-free.
 */
export interface OperationsRegistryView {
  get(operationId: string): OperationDefinition | undefined;
}

/**
 * A thin operation descriptor the invocation helpers (`buildQueryString`,
 * `buildBody`, `validateArgs`) operate on. It is the minimum slice of a daemon
 * OperationDefinition the CLI needs at call time — a CLI surface leaf's
 * invocation info plus its parameter list (derived from `leaf.args`).
 */
export interface CliOperation {
  operationId: string;
  invocation: { method: "GET" | "POST"; path: string };
  streaming?: { eventTypes: string[] };
  parameters?: OperationParameter[];
  /** Optional — present on leaves resolved from the surface, used only for
   *  error messages. */
  commandPath?: string[];
}

export interface LeafCommand {
  type: "leaf";
  leaf: CliLeafNode;
  operation: CliOperation;
  positionalArgs: string[];
  flags: Record<string, string | boolean>;
}

export interface AggregateCommand {
  type: "aggregate";
  leaf: CliLeafNode;
  operations: CliOperation[];
  positionalArgs: string[];
  flags: Record<string, string | boolean>;
}

export interface PackageOpCommand {
  type: "package-op";
  leaf: CliLeafNode;
  targetOperationId: string;
  positionalArgs: string[];
  flags: Record<string, string | boolean>;
}

export interface LocalCommand {
  type: "local";
  leaf: CliLeafNode;
  positionalArgs: string[];
  flags: Record<string, string | boolean>;
}

export type ResolvedCommand =
  | LeafCommand
  | AggregateCommand
  | PackageOpCommand
  | LocalCommand;

export interface HelpRequest {
  /** Segments that identify the help target (empty = root). */
  segments: string[];
  /** The surface node the segments resolved to, if any. */
  node?: CliNode;
}

export type ResolveResult =
  | { type: "command"; command: ResolvedCommand }
  | { type: "help"; help: HelpRequest }
  | { type: "unknown"; segments: string[] };

import { invocationForOperation } from "./surface-utils";

function argsToParameters(
  args: CliLeafNode["args"],
  method: "GET" | "POST",
): OperationParameter[] {
  const location: "query" | "body" = method === "GET" ? "query" : "body";
  return args.map((a) => ({ name: a.name, required: a.required, in: location }));
}

export interface BuildCliOperationOptions {
  /** Surface leaf args used to derive parameter names when no registry match. */
  args?: CliLeafNode["args"];
  /** Human-readable command path, used only in validation error messages. */
  commandPath?: string[];
  /** Optional in-process registry view; when a match is found its parameters win. */
  registry?: OperationsRegistryView;
}

/**
 * Single source of truth for turning an `operationId` into a `CliOperation`.
 *
 * Preference order for parameter metadata:
 *   1. A registry entry (authoritative, matches the daemon contract).
 *   2. Surface leaf args (when the caller knows the CLI argument shape).
 *   3. Nothing — leave `parameters` undefined and let the caller synthesise
 *      positional parameters (used by the package-op fallback).
 *
 * Throws for sentinel operationIds — sentinels must be unwrapped first.
 */
export function buildCliOperation(
  operationId: string,
  opts: BuildCliOperationOptions = {},
): CliOperation {
  const fromRegistry = opts.registry?.get(operationId);
  if (fromRegistry) {
    return {
      operationId,
      invocation: {
        method: fromRegistry.invocation.method,
        path: fromRegistry.invocation.path,
      },
      streaming: fromRegistry.streaming,
      parameters: fromRegistry.parameters,
      commandPath: opts.commandPath,
    };
  }
  const inv = invocationForOperation(operationId);
  return {
    operationId,
    invocation: { method: inv.method, path: inv.path },
    streaming: inv.streaming,
    parameters: opts.args
      ? argsToParameters(opts.args, inv.method)
      : undefined,
    commandPath: opts.commandPath,
  };
}

/**
 * Walk `segments` through the CLI surface. Returns the reached node plus any
 * remaining segments (consumed as positional args when the node is a leaf).
 */
function walkSurface(
  segments: string[],
  surface: CliGroupNode,
): { node: CliNode; consumed: string[]; remaining: string[] } | null {
  let node: CliNode = surface;
  const consumed: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (node.kind === "leaf") {
      return { node, consumed, remaining: segments.slice(i) };
    }
    const next: CliNode | undefined = node.children.find((c) => c.name === seg);
    if (!next) return null;
    node = next;
    consumed.push(seg);
  }
  return { node, consumed, remaining: [] };
}

/**
 * Resolves CLI argv segments against the CLI surface tree.
 *
 * The CLI surface is CLI-owned (REQ-CLI-AGENT-1). Segments descend into the
 * tree until they hit a leaf; any remaining segments become positional args.
 * Aggregate and package-op leaves return dedicated result branches for the
 * dispatcher in `index.ts`.
 *
 * Help is detected in two ways:
 * 1. Empty segments or `help` as the final segment → help request.
 * 2. Intermediate groups accessed without a concrete verb → implicit group help
 *    is NOT produced here; the dispatcher renders group help only when the
 *    user asks for it explicitly via `<group> help`.
 */
export function resolveCommand(
  segments: string[],
  surface: CliGroupNode = CLI_SURFACE,
  flags: Record<string, string | boolean> = {},
): ResolveResult {
  if (segments.length === 0) {
    return { type: "help", help: { segments: [], node: surface } };
  }

  if (segments[segments.length - 1] === "help") {
    const helpSegments = segments.slice(0, -1);
    const walked = walkSurface(helpSegments, surface);
    return {
      type: "help",
      help: {
        segments: helpSegments,
        node: walked && walked.remaining.length === 0 ? walked.node : undefined,
      },
    };
  }

  const walked = walkSurface(segments, surface);
  if (!walked) {
    return { type: "unknown", segments };
  }

  const { node, consumed, remaining } = walked;

  // If we exhausted segments but landed on a group, user typed an incomplete
  // command. Treat as unknown so the caller can suggest the nearest leaf.
  if (node.kind === "group") {
    return { type: "unknown", segments };
  }

  const leaf = node;
  const commandPath = consumed;

  if (leaf.operationId === AGGREGATE_SENTINEL) {
    const ids = leaf.aggregate?.operationIds ?? [];
    const operations = ids.map((id) =>
      buildCliOperation(id, { args: leaf.args, commandPath }),
    );
    return {
      type: "command",
      command: {
        type: "aggregate",
        leaf,
        operations,
        positionalArgs: remaining,
        flags,
      },
    };
  }

  if (leaf.operationId === PACKAGE_OP_SENTINEL) {
    const targetOperationId = remaining[0];
    if (!targetOperationId) {
      return { type: "unknown", segments };
    }
    return {
      type: "command",
      command: {
        type: "package-op",
        leaf,
        targetOperationId,
        positionalArgs: remaining.slice(1),
        flags,
      },
    };
  }

  if (leaf.operationId === LOCAL_COMMAND_SENTINEL) {
    return {
      type: "command",
      command: {
        type: "local",
        leaf,
        positionalArgs: remaining,
        flags,
      },
    };
  }

  const operation = buildCliOperation(leaf.operationId, {
    args: leaf.args,
    commandPath,
  });
  return {
    type: "command",
    command: {
      type: "leaf",
      leaf,
      operation,
      positionalArgs: remaining,
      flags,
    },
  };
}

/**
 * Builds a query string from positional args mapped to GET parameters.
 */
export function buildQueryString(
  op: CliOperation,
  positionalArgs: string[],
): string {
  const params = (op.parameters ?? []).filter((p) => p.in === "query");
  const pairs: string[] = [];

  for (let i = 0; i < params.length && i < positionalArgs.length; i++) {
    if (positionalArgs[i] === "") continue;
    pairs.push(
      `${encodeURIComponent(params[i].name)}=${encodeURIComponent(positionalArgs[i])}`,
    );
  }

  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

/**
 * Builds a JSON body from positional args mapped to POST parameters.
 * Optional extraFields are merged in (e.g. boolean flags like --clean → { clean: true }).
 * Positional args always take precedence over extraFields.
 */
export function buildBody(
  op: CliOperation,
  positionalArgs: string[],
  extraFields?: Record<string, unknown>,
): string | undefined {
  const params = (op.parameters ?? []).filter((p) => p.in === "body");
  if (
    params.length === 0 &&
    positionalArgs.length === 0 &&
    (!extraFields || Object.keys(extraFields).length === 0)
  ) {
    return undefined;
  }

  const body: Record<string, unknown> = {};
  for (let i = 0; i < params.length && i < positionalArgs.length; i++) {
    body[params[i].name] = positionalArgs[i];
  }

  if (extraFields) {
    for (const [key, value] of Object.entries(extraFields)) {
      if (!(key in body)) {
        body[key] = value;
      }
    }
  }

  return JSON.stringify(body);
}

/**
 * Validates that all required parameters have values.
 * Returns an error message if validation fails, or null if valid.
 */
export function validateArgs(
  op: CliOperation,
  positionalArgs: string[],
): string | null {
  const params = op.parameters ?? [];
  const required = params.filter((p) => p.required);

  if (positionalArgs.length < required.length) {
    const missing = required.slice(positionalArgs.length);
    const usage = params.map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`)).join(" ");
    const cmdSegments = (op.commandPath ?? op.invocation.path.split("/").filter(Boolean)).join(
      " ",
    );
    return `Missing required argument: ${missing.map((p) => p.name).join(", ")}\nUsage: guild-hall ${cmdSegments} ${usage}`;
  }

  return null;
}
