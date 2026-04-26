import { resolveP4Env, createP4Runner } from "./p4";
import { shelve } from "./shelve";
import type { GitRunner } from "./shelve";
import { init } from "./init";

const USAGE = `Usage: bun run lib/p4-adapter/index.ts <command>

Commands:
  init [workspace-dir]              Create a disposable git repo from the current P4 workspace state
  shelve [--force] <description>    Translate git changes into a P4 shelved changelist

The cycle: p4 sync -> init -> work in Guild Hall -> shelve -> Swarm review
WARNING: Do not run 'p4 sync' between init and shelve. The cycle is atomic.
`;

function createGitRunner(cwd: string): GitRunner {
  return async (args: string[]) => {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return { stdout, exitCode };
  };
}

async function main(): Promise<void> {
  const command = process.argv[2];

  if (!command || (command !== "init" && command !== "shelve")) {
    console.log(USAGE);
    process.exit(command ? 1 : 0);
  }

  if (command === "init") {
    const workspaceDir = process.argv[3] || process.cwd();
    const p4Env = resolveP4Env(workspaceDir);
    const p4Runner = createP4Runner(p4Env);

    try {
      const result = await init({ workspaceDir, p4Runner });
      console.log(`Initialized git workspace at ${workspaceDir}`);
      console.log(`Baseline: @${result.baselineChangelist}`);
      console.log(`Tracked files: ${result.trackedFileCount}`);
      for (const warning of result.warnings) {
        console.log(`WARNING: ${warning}`);
      }
    } catch (error) {
      console.error(
        `init failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.error("\nHint: Ensure you are in a P4 workspace with a whitelist .gitignore.");
      process.exit(1);
    }
    return;
  }

  if (command === "shelve") {
    const workspaceDir = process.cwd();
    const args = process.argv.slice(3);
    let force = false;
    const descParts: string[] = [];

    for (const arg of args) {
      if (arg === "--force") {
        force = true;
      } else {
        descParts.push(arg);
      }
    }

    const description = descParts.join(" ");
    if (!description) {
      console.error("Error: shelve requires a changelist description.");
      console.error("\nHint: bun run lib/p4-adapter/index.ts shelve \"My changelist description\"");
      process.exit(1);
    }

    const p4Env = resolveP4Env(workspaceDir);
    const p4Runner = createP4Runner(p4Env);
    const gitRunner = createGitRunner(workspaceDir);

    try {
      const result = await shelve({
        workspaceDir,
        description,
        force,
        p4Runner,
        gitRunner,
      });

      console.log(`Shelved changelist @${result.changelist}`);
      console.log(`  Added:    ${result.added} file${result.added !== 1 ? "s" : ""}`);
      console.log(`  Modified: ${result.modified} file${result.modified !== 1 ? "s" : ""}`);
      console.log(`  Deleted:  ${result.deleted} file${result.deleted !== 1 ? "s" : ""}`);
      console.log();
      console.log(`Create a Swarm review: p4 shelve -c ${result.changelist} (already shelved)`);
      console.log("Next cycle: p4 sync && bun run lib/p4-adapter/index.ts init");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      console.error("\nHint: Run from within an initialized P4 adapter workspace.");
      process.exit(1);
    }
  }
}

void main();
