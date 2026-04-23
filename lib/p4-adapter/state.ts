import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const STATE_FILE = ".p4-adapter.json";

export type AdapterState = {
  baselineChangelist: number;
  baselineCommitSha: string;
  initTimestamp: string;
  workspaceRoot: string;
};

/**
 * Read adapter state from .p4-adapter.json in the given directory.
 * Returns null if the file does not exist.
 */
export function readState(dir: string): AdapterState | null {
  const filePath = join(dir, STATE_FILE);
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as AdapterState;
}

/**
 * Write adapter state to .p4-adapter.json in the given directory.
 */
export function writeState(dir: string, state: AdapterState): void {
  const filePath = join(dir, STATE_FILE);
  writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
}
