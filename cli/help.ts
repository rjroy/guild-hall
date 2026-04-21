/**
 * Help rendering for the agent-first CLI.
 *
 * The help tree is CLI-owned and resolved against `CLI_SURFACE` — the CLI
 * issues no daemon requests to render help (REQ-CLI-AGENT-26). Each render
 * helper returns both human-readable text and a JSON payload following the
 * schema in `.lore/plans/infrastructure/cli-agent-surface.md` §Phase 3.
 */

import {
  CLI_SURFACE,
  type CliGroupNode,
  type CliLeafNode,
  type CliNode,
} from "./surface";
import { invocationForOperation, operationIdsFor } from "./surface-utils";

export interface RenderedHelp {
  text: string;
  json: Record<string, unknown>;
}

function describeChild(
  child: CliNode,
  parentPath: string[],
): { kind: "group" | "leaf"; name: string; path: string; description: string } {
  return {
    kind: child.kind,
    name: child.name,
    path: "/" + [...parentPath, child.name].join("/"),
    description: child.description,
  };
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

function commandForPath(path: string[]): string {
  return path.length === 0 ? "guild-hall" : `guild-hall ${path.join(" ")}`;
}

/**
 * Root help — the entry page users see when they type `guild-hall help`
 * with no scope. Includes a top-level example and surfaces the built-in
 * `migrate-content` command (REQ-CLI-AGENT-14).
 */
export function renderRootHelp(surface: CliGroupNode = CLI_SURFACE): RenderedHelp {
  const children = surface.children.map((c) => describeChild(c, []));
  const maxNameWidth = Math.max(
    ...children.map((c) => c.name.length),
    "migrate-content".length,
  );

  const lines: string[] = [];
  lines.push("Guild Hall CLI");
  lines.push(surface.description);
  lines.push("");
  lines.push("Commands:");
  for (const child of children) {
    lines.push(`  ${pad(child.name, maxNameWidth + 2)}${child.description}`);
  }
  lines.push(
    `  ${pad("migrate-content", maxNameWidth + 2)}Migrate result_summary from frontmatter to body`,
  );
  lines.push("");
  lines.push("Run 'guild-hall <command> help' for more information.");
  lines.push("");
  lines.push("Example: guild-hall commission list --state=requested");

  const json = {
    kind: "group" as const,
    path: "/",
    name: surface.name,
    description: surface.description,
    children,
    example: "guild-hall commission list --state=requested",
  };

  return { text: lines.join("\n"), json };
}

/**
 * Group help — lists the immediate children of any intermediate group
 * (REQ-CLI-AGENT-15).
 */
export function renderGroupHelp(
  node: CliGroupNode,
  path: string[],
): RenderedHelp {
  const children = node.children.map((c) => describeChild(c, path));
  const maxNameWidth = children.length > 0
    ? Math.max(...children.map((c) => c.name.length))
    : 0;

  const lines: string[] = [];
  lines.push(commandForPath(path));
  lines.push(node.description);
  lines.push("");
  if (children.length > 0) {
    lines.push("Commands:");
    for (const child of children) {
      lines.push(`  ${pad(child.name, maxNameWidth + 2)}${child.description}`);
    }
    lines.push("");
    lines.push(`Run '${commandForPath(path)} <command> help' for more information.`);
  }

  const json: Record<string, unknown> = {
    kind: "group",
    path: "/" + path.join("/"),
    name: node.name,
    description: node.description,
    children,
  };

  return { text: lines.join("\n"), json };
}

/**
 * Leaf help — full command path, description, args, flags, example, and
 * output shape (REQ-CLI-AGENT-16).
 */
export function renderLeafHelp(
  node: CliLeafNode,
  path: string[],
): RenderedHelp {
  const lines: string[] = [];
  lines.push(commandForPath(path));
  lines.push(node.description);
  lines.push("");

  // Method + path: for aggregates we list the fan-out, for package-op we
  // explain the forwarding contract, for regular leaves we show one HTTP
  // path so scripts can mirror it.
  const opIds = operationIdsFor(node);
  if (node.aggregate) {
    lines.push(`  Aggregates: ${node.aggregate.operationIds.join(", ")}`);
    lines.push(`  Reason:     ${node.aggregate.justification}`);
  } else if (opIds.length === 1) {
    const inv = invocationForOperation(opIds[0]);
    lines.push(`  Method:  ${inv.method}`);
    lines.push(`  Path:    ${inv.path}`);
    if (inv.streaming) {
      lines.push(`  Stream:  yes (${inv.streaming.eventTypes.join(", ")})`);
    }
  } else {
    lines.push("  (package-op fallback — forwards to the target operationId)");
  }

  const args = node.args ?? [];
  if (args.length > 0) {
    lines.push("");
    lines.push("Arguments:");
    const maxArgName = Math.max(...args.map((a) => a.name.length));
    for (const arg of args) {
      const req = arg.required ? "(required)" : "(optional)";
      lines.push(`  ${pad(arg.name, maxArgName + 2)}${req} ${arg.description}`);
    }
  }

  const flags = node.flags ?? [];
  if (flags.length > 0) {
    lines.push("");
    lines.push("Flags:");
    const maxFlagName = Math.max(...flags.map((f) => f.name.length));
    for (const flag of flags) {
      const def = flag.default !== undefined ? ` [default: ${flag.default}]` : "";
      lines.push(
        `  --${pad(flag.name, maxFlagName + 2)}${flag.type.padEnd(8)}${flag.description}${def}`,
      );
    }
  }

  lines.push("");
  lines.push(`Example: ${node.example}`);
  lines.push(`Output:  ${node.outputShape}`);

  const jsonArgs = args.map((a) => ({
    name: a.name,
    required: a.required,
    type: a.type,
    description: a.description,
  }));
  const jsonFlags = flags.map((f) => ({
    name: f.name,
    type: f.type,
    default: f.default,
    description: f.description,
  }));

  const json: Record<string, unknown> = {
    kind: "leaf",
    path: "/" + path.join("/"),
    name: node.name,
    description: node.description,
    args: jsonArgs,
    flags: jsonFlags,
    example: node.example,
    outputShape: node.outputShape,
  };

  return { text: lines.join("\n"), json };
}

/**
 * Dispatch helper: pick the right renderer for any node.
 */
export function renderHelp(node: CliNode, path: string[]): RenderedHelp {
  if (node.kind === "leaf") return renderLeafHelp(node, path);
  if (path.length === 0) return renderRootHelp(node);
  return renderGroupHelp(node, path);
}
