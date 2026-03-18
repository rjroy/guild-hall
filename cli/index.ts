#!/usr/bin/env bun
import * as path from "node:path";
import { daemonFetch, isDaemonError } from "@/lib/daemon-client";
import { migrateContentToBody } from "./migrate-content-to-body";
import {
  resolveCommand,
  buildQueryString,
  buildBody,
  validateArgs,
} from "./resolve";
import type { CliOperation } from "./resolve";
import {
  extractFlags,
  shouldOutputJson,
  formatResponse,
  formatHelpTree,
  formatOperationHelp,
  suggestCommand,
} from "./format";
import type { HelpNode } from "./format";
import { streamOperation } from "./stream";

/**
 * Fetches the flat operation list from the daemon.
 * Returns null if the daemon is unreachable.
 */
async function fetchOperations(): Promise<CliOperation[] | null> {
  const result = await daemonFetch("/help/operations");
  if (isDaemonError(result)) return null;
  if (!result.ok) return null;

  const data = (await result.json()) as { operations: CliOperation[] };
  return data.operations;
}

/**
 * Fetches help tree data from the daemon at the given hierarchy path.
 */
async function fetchHelpTree(segments: string[]): Promise<HelpNode | null> {
  const helpPath =
    segments.length > 0
      ? `/${segments.join("/")}/help`
      : "/help";

  const result = await daemonFetch(helpPath);
  if (isDaemonError(result)) return null;
  if (!result.ok) return null;

  return (await result.json()) as HelpNode;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { segments, options } = extractFlags(argv);
  const jsonMode = shouldOutputJson(options);

  // Special case: migrate-content is a local command, not a daemon skill
  if (segments[0] === "migrate-content") {
    const applyFlag = argv.includes("--apply");
    const exitCode = await migrateContentToBody(applyFlag);
    process.exit(exitCode);
  }

  // Fetch operation catalog from daemon
  const skills = await fetchOperations();
  if (!skills) {
    console.error(
      "Daemon is not running. Start the daemon first: bun run dev:daemon",
    );
    process.exit(1);
  }

  const resolved = resolveCommand(segments, skills);

  switch (resolved.type) {
    case "help": {
      // Check if segments resolve to a specific skill (leaf help)
      if (resolved.help.segments.length > 0) {
        const pathStr = `/${resolved.help.segments.join("/")}`;
        const skill = skills.find((s) => s.invocation.path === pathStr);
        if (skill) {
          if (jsonMode) {
            console.log(JSON.stringify(skill, null, 2));
          } else {
            console.log(formatOperationHelp(skill));
          }
          return;
        }
      }

      // Fetch help tree from the daemon's hierarchy
      const helpData = await fetchHelpTree(resolved.help.segments);
      if (!helpData) {
        console.error("Could not fetch help from daemon.");
        process.exit(1);
      }

      if (jsonMode) {
        console.log(JSON.stringify(helpData, null, 2));
      } else {
        console.log(formatHelpTree(helpData, resolved.help.segments));
      }
      return;
    }

    case "unknown": {
      const suggestion = suggestCommand(resolved.segments, skills);
      const msg = `Unknown command: ${resolved.segments.join(" ")}`;
      if (suggestion) {
        console.error(`${msg}\n\nDid you mean: guild-hall ${suggestion}?`);
      } else {
        console.error(`${msg}\n\nRun 'guild-hall help' to see available commands.`);
      }
      process.exit(1);
      break;
    }

    case "command": {
      const { operation: skill, positionalArgs } = resolved.command;

      // For register, resolve the path argument before sending
      const cmdSegments = skill.invocation.path.split("/").filter(Boolean);
      const isRegister = cmdSegments[cmdSegments.length - 1] === "register";
      const resolvedArgs =
        isRegister && positionalArgs.length >= 2
          ? [positionalArgs[0], path.resolve(positionalArgs[1])]
          : positionalArgs;

      // Validate required args
      const error = validateArgs(skill, resolvedArgs);
      if (error) {
        console.error(error);
        process.exit(1);
      }

      // Streaming skills use SSE
      if (skill.streaming) {
        const body = buildBody(skill, resolvedArgs);
        await streamOperation(skill.invocation.path, body);
        return;
      }

      // Standard request
      const isGet = skill.invocation.method === "GET";
      const requestPath = isGet
        ? `${skill.invocation.path}${buildQueryString(skill, resolvedArgs)}`
        : skill.invocation.path;

      const result = await daemonFetch(requestPath, {
        method: skill.invocation.method,
        body: isGet ? undefined : buildBody(skill, resolvedArgs),
      });

      if (isDaemonError(result)) {
        console.error(`Failed to reach daemon: ${result.message}`);
        process.exit(1);
      }

      const data: unknown = await result.json();

      if (!result.ok) {
        const errObj = data as { error?: string };
        console.error(
          errObj.error ?? `Request failed (HTTP ${result.status})`,
        );
        process.exit(1);
      }

      console.log(formatResponse(data, jsonMode));
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
