#!/usr/bin/env bun
import { register } from "./register";
import { rebase, sync } from "./rebase";
import { validate } from "./validate";
import { migrateContentToBody } from "./migrate-content-to-body";

const USAGE = `Guild Hall CLI

Commands:
  register <name> <path>  Register a project
  rebase [name]           Rebase claude branch onto master
  sync [name]             Fetch + smart sync (detects merged PRs, resets or rebases)
  validate                Validate config and projects
  migrate-content         Migrate result_summary from frontmatter to body (dry-run)
  migrate-content --apply Migrate result_summary from frontmatter to body (write)
  help                    Show this help message`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "register": {
      const name = args[1];
      const projectPath = args[2];
      if (!name || !projectPath) {
        console.error("Usage: guild-hall register <name> <path>");
        process.exit(1);
      }
      await register(name, projectPath);
      break;
    }

    case "rebase": {
      const projectName = args[1]; // optional
      await rebase(projectName);
      break;
    }

    case "sync": {
      const projectName = args[1]; // optional
      await sync(projectName);
      break;
    }

    case "validate": {
      const exitCode = await validate();
      process.exit(exitCode);
      break;
    }

    case "migrate-content": {
      const applyFlag = args.includes("--apply");
      const exitCode = await migrateContentToBody(applyFlag);
      process.exit(exitCode);
      break;
    }

    case "help":
    case undefined:
    default:
      console.log(USAGE);
      break;
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
