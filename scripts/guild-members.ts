#!/usr/bin/env bun
/**
 * Guild Members utility script
 * Discovers all plugins in guild-members/ and runs operations on them.
 *
 * Supports both flat and nested plugin structures:
 * - Flat: guild-members/example/
 * - Nested: guild-members/guild-founders/mail-call/
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

const GUILD_MEMBERS_DIR = "guild-members";
const MAX_DEPTH = 2;

interface Plugin {
  name: string;
  path: string;
}

async function findPlugins(): Promise<Plugin[]> {
  const plugins: Plugin[] = [];

  async function scan(dir: string, depth: number, baseName: string = ""): Promise<void> {
    if (depth > MAX_DEPTH) return;

    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "node_modules") continue;

      const entryPath = join(dir, entry.name);
      const fullName = baseName ? `${baseName}/${entry.name}` : entry.name;

      // Check if this directory has a package.json
      try {
        await stat(join(entryPath, "package.json"));
        plugins.push({ name: fullName, path: entryPath });
      } catch {
        // No package.json, continue scanning
      }

      // Continue scanning deeper
      await scan(entryPath, depth + 1, fullName);
    }
  }

  try {
    await scan(GUILD_MEMBERS_DIR, 0);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(`No ${GUILD_MEMBERS_DIR}/ directory found`);
      return [];
    }
    throw error;
  }

  return plugins;
}

async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: "inherit",
      shell: true,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on("error", reject);
  });
}

async function installPlugins(plugins: Plugin[]): Promise<void> {
  if (plugins.length === 0) {
    console.log("No plugins with package.json found");
    return;
  }

  console.log(`Found ${plugins.length} plugin(s) with dependencies:\n`);

  for (const plugin of plugins) {
    console.log(`📦 Installing ${plugin.name}...`);
    try {
      await runCommand("bun", ["install"], plugin.path);
      console.log(`✓ ${plugin.name}\n`);
    } catch (error) {
      console.error(`✗ ${plugin.name}: ${error}\n`);
      process.exitCode = 1;
    }
  }
}

async function buildPlugins(plugins: Plugin[]): Promise<void> {
  if (plugins.length === 0) {
    console.log("No plugins with package.json found");
    return;
  }

  console.log(`Found ${plugins.length} plugin(s) to build:\n`);

  for (const plugin of plugins) {
    // Check if plugin has a build script
    try {
      const pkg = await import(join(process.cwd(), plugin.path, "package.json"));
      if (!pkg.scripts?.build) {
        console.log(`⊘ ${plugin.name} (no build script)`);
        continue;
      }

      console.log(`🔨 Building ${plugin.name}...`);
      await runCommand("bun", ["run", "build"], plugin.path);
      console.log(`✓ ${plugin.name}\n`);
    } catch (error) {
      console.error(`✗ ${plugin.name}: ${error}\n`);
      process.exitCode = 1;
    }
  }
}

async function testPlugins(plugins: Plugin[]): Promise<void> {
  if (plugins.length === 0) {
    console.log("No plugins with package.json found");
    return;
  }

  console.log(`Found ${plugins.length} plugin(s) to test:\n`);

  for (const plugin of plugins) {
    // Check if plugin has a test script
    try {
      const pkg = await import(join(process.cwd(), plugin.path, "package.json"));
      if (!pkg.scripts?.test) {
        console.log(`⊘ ${plugin.name} (no test script)`);
        continue;
      }

      console.log(`🧪 Testing ${plugin.name}...`);
      await runCommand("bun", ["run", "test"], plugin.path);
      console.log(`✓ ${plugin.name}\n`);
    } catch (error) {
      console.error(`✗ ${plugin.name}: ${error}\n`);
      process.exitCode = 1;
    }
  }
}

async function main() {
  const operation = process.argv[2];

  if (!operation || !["install", "build", "test"].includes(operation)) {
    console.error("Usage: bun run scripts/guild-members.ts <install|build|test>");
    process.exit(1);
  }

  const plugins = await findPlugins();

  if (operation === "install") {
    await installPlugins(plugins);
  } else if (operation === "build") {
    await buildPlugins(plugins);
  } else if (operation === "test") {
    await testPlugins(plugins);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
