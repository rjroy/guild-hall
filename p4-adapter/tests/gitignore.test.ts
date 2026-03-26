import { describe, it, expect, afterEach } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  validateWhitelistModel,
  validateParentChains,
  ensureP4Exclusions,
  ensureP4Ignore,
} from "../gitignore";
import { readState, writeState, type AdapterState } from "../state";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "p4-adapter-test-"));
}

let tempDirs: string[] = [];

function createTempDir(): string {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

// Test case 5: Missing or non-whitelist .gitignore
describe("validateWhitelistModel", () => {
  it("accepts a valid whitelist .gitignore", () => {
    const content = "# Deny everything\n*\n\n!/Source/\n";
    const result = validateWhitelistModel(content);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects a .gitignore that does not start with *", () => {
    const content = "node_modules/\n*.log\n";
    const result = validateWhitelistModel(content);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("whitelist model");
    expect(result.error).toContain("*");
  });

  it("rejects an empty .gitignore", () => {
    const result = validateWhitelistModel("");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("whitelist model");
  });

  it("rejects a .gitignore with only comments", () => {
    const content = "# This is a comment\n# Another comment\n";
    const result = validateWhitelistModel(content);
    expect(result.valid).toBe(false);
  });

  it("accepts * after leading comments and blank lines", () => {
    const content = "# Deny all files by default\n\n*\n!/Source/\n";
    const result = validateWhitelistModel(content);
    expect(result.valid).toBe(true);
  });
});

// Test case 6: Broken parent chain warnings
describe("validateParentChains", () => {
  it("returns no warnings for valid parent chains", () => {
    const content = [
      "*",
      "!/Source/",
      "!/Source/Runtime/",
      "!/Source/Runtime/MyFeature/**",
    ].join("\n");
    const warnings = validateParentChains(content);
    expect(warnings).toEqual([]);
  });

  it("warns when intermediate parent is missing", () => {
    const content = [
      "*",
      "!/Source/",
      "!/Source/Runtime/MyFeature/**",
    ].join("\n");
    const warnings = validateParentChains(content);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("Source/Runtime/MyFeature");
    expect(warnings[0]).toContain("Source/Runtime/");
  });

  it("warns when root parent is missing", () => {
    const content = [
      "*",
      "!/Source/Runtime/",
      "!/Source/Runtime/MyFeature/**",
    ].join("\n");
    const warnings = validateParentChains(content);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings[0]).toContain("Source/");
  });

  it("returns no warnings for single-level negations", () => {
    const content = ["*", "!/README.md"].join("\n");
    const warnings = validateParentChains(content);
    expect(warnings).toEqual([]);
  });

  it("handles multiple independent chains", () => {
    const content = [
      "*",
      "!/Source/",
      "!/Source/Runtime/**",
      "!/Config/",
      "!/Config/Settings/**",
    ].join("\n");
    const warnings = validateParentChains(content);
    expect(warnings).toEqual([]);
  });
});

// Test case 23: .gitignore excludes P4 metadata
describe("ensureP4Exclusions", () => {
  it("adds missing P4 metadata exclusions", () => {
    const content = "*\n!/Source/\n";
    const result = ensureP4Exclusions(content);
    expect(result).toContain(".p4config");
    expect(result).toContain(".p4ignore");
    expect(result).toContain(".p4-adapter.json");
  });

  it("does not duplicate existing exclusions", () => {
    const content = "*\n.p4config\n.p4ignore\n.p4-adapter.json\n";
    const result = ensureP4Exclusions(content);
    expect(result).toBe(content);
  });

  it("only adds entries that are missing", () => {
    const content = "*\n.p4config\n";
    const result = ensureP4Exclusions(content);
    expect(result).toContain(".p4ignore");
    expect(result).toContain(".p4-adapter.json");
    // .p4config should appear exactly once
    const matches = result.match(/\.p4config/g);
    expect(matches?.length).toBe(1);
  });
});

// Test case 22: .p4ignore contains .git/ and .gitignore after init
describe("ensureP4Ignore", () => {
  it("creates .p4ignore with git exclusions when file does not exist", () => {
    const dir = createTempDir();
    ensureP4Ignore(dir);

    const content = readFileSync(join(dir, ".p4ignore"), "utf-8");
    expect(content).toContain(".git/");
    expect(content).toContain(".gitignore");
    expect(content).toContain(".p4-adapter.json");
  });

  it("adds missing entries to existing .p4ignore", () => {
    const dir = createTempDir();
    const filePath = join(dir, ".p4ignore");
    const { writeFileSync } = require("fs");
    writeFileSync(filePath, "*.bak\n", "utf-8");

    ensureP4Ignore(dir);

    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("*.bak");
    expect(content).toContain(".git/");
    expect(content).toContain(".gitignore");
  });

  it("does not modify .p4ignore when entries already present", () => {
    const dir = createTempDir();
    const filePath = join(dir, ".p4ignore");
    const original = ".git/\n.gitignore\n.p4-adapter.json\n";
    const { writeFileSync } = require("fs");
    writeFileSync(filePath, original, "utf-8");

    ensureP4Ignore(dir);

    const content = readFileSync(filePath, "utf-8");
    expect(content).toBe(original);
  });
});

// State round-trip test
describe("state read/write", () => {
  it("round-trips adapter state through JSON", () => {
    const dir = createTempDir();
    const state: AdapterState = {
      baselineChangelist: 12345,
      baselineCommitSha: "abc123def456789",
      initTimestamp: "2026-03-25T08:00:00Z",
      workspaceRoot: "/path/to/workspace",
    };

    writeState(dir, state);
    const loaded = readState(dir);

    expect(loaded).toEqual(state);
  });

  it("returns null when state file does not exist", () => {
    const dir = createTempDir();
    const loaded = readState(dir);
    expect(loaded).toBeNull();
  });
});
