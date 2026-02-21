#!/usr/bin/env bun
import { register } from "./register";
import { validate } from "./validate";

const USAGE = `Guild Hall CLI

Commands:
  register <name> <path>  Register a project
  validate                Validate config and projects
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

    case "validate": {
      const exitCode = await validate();
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
