---
title: Sandboxed Execution Environments
date: 2026-03-12
status: executed
tags: [security, sandbox, agent-sdk, permissions, toolbox]
modules: [sdk-runner, toolbox-resolver, lib-types, lib-packages]
related:
  - .lore/specs/infrastructure/sandboxed-execution.md
  - .lore/specs/workers/tool-availability-enforcement.md
  - .lore/research/claude-agent-sdk-sandboxing.md
  - .lore/plans/workers/tool-availability-enforcement.md
---

# Plan: Sandboxed Execution Environments

## Spec Reference

**Spec**: `.lore/specs/infrastructure/sandboxed-execution.md`
**Research**: `.lore/research/claude-agent-sdk-sandboxing.md`
**Foundation**: `.lore/plans/workers/tool-availability-enforcement.md` (already implemented; TAE is gate 1 in the enforcement chain)

Requirements addressed:

**Phase 1 (SDK Sandbox):**
- REQ-SBX-1: `sandbox` field on `SdkQueryOptions` -> Step 1
- REQ-SBX-2, SBX-3, SBX-7: `prepareSdkSession` injection logic -> Step 2
- REQ-SBX-4, SBX-5, SBX-6: Omitted sandbox fields (explicit non-configuration) -> Step 2
- REQ-SBX-8: Filesystem restrictions out of scope for Phase 1 -> verified (no action)
- REQ-SBX-9: Bubblewrap prerequisite detection -> Step 3
- REQ-SBX-10: Phase 1 tests -> Step 4

**Phase 2 (canUseTool Rules):**
- REQ-SBX-11: `CanUseToolRule` type and `WorkerMetadata.canUseToolRules` -> Step 5
- REQ-SBX-12, SBX-13, SBX-14: Rule matching semantics -> Step 7
- REQ-SBX-15: Package validation (rules reference only declared tools) -> Step 6
- REQ-SBX-16: Denial sets `interrupt: false` -> Step 7
- REQ-SBX-17: `ResolvedToolSet.canUseToolRules` -> Step 5
- REQ-SBX-18: `SdkQueryOptions.canUseTool` -> Step 7
- REQ-SBX-19: Toolbox resolver passes through `canUseToolRules` -> Step 5
- REQ-SBX-20, SBX-21: `prepareSdkSession` builds/omits `canUseTool` callback -> Step 7
- REQ-SBX-22, SBX-23: Phase 1 + Phase 2 coexistence (defense in depth) -> verified across Steps 2 and 7
- REQ-SBX-24: Phase 2 tests -> Steps 6, 8

## Codebase Context

**SdkQueryOptions** (`apps/daemon/lib/agent-sdk/sdk-runner.ts:35-50`): The local type for SDK session options. Has `tools`, `allowedTools`, `model`, `env`, etc. No `sandbox` or `canUseTool` fields today. The SDK's `Options` type accepts both; they flow through to `query()`.

**prepareSdkSession** (`apps/daemon/lib/agent-sdk/sdk-runner.ts:237-404`): 5-step setup: find worker, resolve tools, load memories, activate, build options. Step 5 (line 385-400) constructs the final `SdkQueryOptions` object. This is where sandbox settings and `canUseTool` injection happen.

The function already reads `activation.tools.builtInTools` (line 390) to populate the `tools` field (from TAE). The condition "worker has Bash" is `activation.tools.builtInTools.includes("Bash")`, which is available at step 5 without any new plumbing.

**Toolbox resolver** (`apps/daemon/services/toolbox-resolver.ts:63-144`): Returns `{ mcpServers, allowedTools, builtInTools }`. Adding `canUseToolRules` to the return value means adding it to `ResolvedToolSet` in `lib/types.ts:222-226` and passing `worker.canUseToolRules ?? []` through at line 143.

**ResolvedToolSet** (`lib/types.ts:222-226`): Shared type. Adding `canUseToolRules` here causes compile errors in every test fixture that constructs one without the new field. The full fixture list (same set affected by TAE):

| File | Fixture | Value for `canUseToolRules` |
|------|---------|---------------------------|
| `apps/daemon/tests/services/sdk-runner.test.ts` | `mockResolvedTools` (multiple) | `[]` |
| `apps/daemon/tests/services/sdk-runner.test.ts` | inline `tools` overrides | `[]` |
| `apps/daemon/tests/services/manager-worker.test.ts` | `defaultTools` (line 23) | `[]` |
| `apps/daemon/tests/services/manager-worker.test.ts` | inline `ResolvedToolSet` | `[]` |
| `packages/tests/worker-role-smoke.test.ts` | `makeResolvedTools()` | `[]` |
| `packages/tests/worker-activation.test.ts` | `makeResolvedTools()` | `[]` |

**WorkerMetadata** (`lib/types.ts:176-190`): Has `builtInTools: string[]`. No `canUseToolRules` today. Adding it as optional avoids breaking existing packages that don't declare rules.

**Package validation** (`lib/packages.ts:62-74`): `workerMetadataSchema` validates the `guildHall` key from `package.json`. REQ-SBX-15's cross-field check (rules must reference tools in `builtInTools`) fits as a `z.superRefine()` on the schema.

**Glob matching** (REQ-SBX-13): No glob-matching library exists in the project. The spec prefers `micromatch`. This is the only new dependency in the entire plan.

**Activation chain**: `resolvedTools` flows from `resolveToolSet` through `ActivationContext.resolvedTools` through `ActivationResult.tools` to `prepareSdkSession`'s `activation.tools`. The `canUseToolRules` field on `ResolvedToolSet` flows through without any intermediate code changes (same pattern as `builtInTools` from the TAE plan).

**Current worker applicability**: Dalton and Sable declare `"Bash"` in `builtInTools`. Octavia, Thorne, Verity, and Guild Master do not. Phase 1 sandbox injection fires for Dalton and Sable only.

## Phase 1: SDK Sandbox for Bash-Capable Workers

### Step 1: Add `sandbox` to `SdkQueryOptions`

**Files**: `apps/daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-SBX-1

Add `sandbox` to `SdkQueryOptions` (after `env`, around line 49):

```typescript
export type SdkQueryOptions = {
  // ... existing fields ...
  env?: Record<string, string | undefined>;
  sandbox?: {
    enabled?: boolean;
    autoAllowBashIfSandboxed?: boolean;
    excludedCommands?: string[];
    allowUnsandboxedCommands?: boolean;
    network?: {
      allowLocalBinding?: boolean;
      allowUnixSockets?: string[];
      allowAllUnixSockets?: boolean;
      httpProxyPort?: number;
      socksProxyPort?: number;
    };
    ignoreViolations?: {
      file?: string[];
      network?: string[];
    };
    enableWeakerNestedSandbox?: boolean;
  };
};
```

The type mirrors the SDK's `SandboxSettings` structurally without importing it. This avoids coupling `SdkQueryOptions` to the SDK's full type tree (consistent with existing fields like `tools` and `env` which also use structural types).

**Verification**: `bun run typecheck` passes (additive, optional field).

### Step 2: Inject sandbox settings in `prepareSdkSession`

**Files**: `apps/daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-SBX-2, REQ-SBX-3, REQ-SBX-4, REQ-SBX-5, REQ-SBX-6, REQ-SBX-7

In `prepareSdkSession`, at step 5c (after local env resolution, before building the options object at line 385), add sandbox injection:

```typescript
// 5d. Inject sandbox settings for Bash-capable workers (REQ-SBX-2)
const hasBash = activation.tools.builtInTools.includes("Bash");
const sandboxSettings = hasBash
  ? {
      enabled: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      network: {
        allowLocalBinding: false,
      },
    }
  : undefined;
```

Then add it to the options object:

```typescript
const options: SdkQueryOptions = {
  // ... existing fields ...
  ...(sandboxSettings ? { sandbox: sandboxSettings } : {}),
  // ... rest unchanged ...
};
```

Key points:
- `hasBash` checks `activation.tools.builtInTools`, not `workerMeta.builtInTools`. This is the post-resolution value from TAE enforcement, so it respects any filtering that happens during activation.
- No `excludedCommands` set (REQ-SBX-4).
- No `allowUnixSockets` set (REQ-SBX-5).
- No `enableWeakerNestedSandbox` set (REQ-SBX-6).
- Non-Bash workers get no sandbox at all (REQ-SBX-7): the conditional spread produces `{}`.

**Verification**: `bun run typecheck` passes.

### Step 3: Bubblewrap prerequisite detection

**Files**: `apps/daemon/app.ts`
**Addresses**: REQ-SBX-9

At daemon startup, after package discovery and before session setup, check whether any Bash-capable worker is loaded and whether `bwrap` is available. The check runs once, at boot, and logs a warning if the prerequisite is missing.

Add after the `allPackages` assembly (around line 174):

```typescript
// Check for bubblewrap prerequisite on Linux (REQ-SBX-9)
if (process.platform === "linux") {
  const hasBashWorker = allPackages.some((p) => {
    if (!("identity" in p.metadata)) return false;
    return (p.metadata as WorkerMetadata).builtInTools.includes("Bash");
  });

  if (hasBashWorker) {
    try {
      const proc = Bun.spawn(["which", "bwrap"], { stdout: "ignore", stderr: "ignore" });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        console.warn(
          "[daemon] WARNING: Bash-capable workers are loaded but bubblewrap (bwrap) " +
            "is not installed. SDK sandbox isolation requires bubblewrap and socat. " +
            "Install with: sudo pacman -S bubblewrap socat (Arch) or " +
            "sudo apt install bubblewrap socat (Debian/Ubuntu).",
        );
      }
    } catch {
      console.warn(
        "[daemon] WARNING: Could not check for bubblewrap availability. " +
          "SDK sandbox isolation requires bubblewrap and socat on Linux.",
      );
    }
  }
}
```

Import `WorkerMetadata` from `@/lib/types` if not already imported.

The detection uses `which bwrap` rather than attempting a sandbox invocation. This is a best-effort check: it confirms the binary exists but doesn't verify that namespace creation works (which depends on kernel config). A failure here doesn't prevent startup; it warns loudly. The actual sandbox failure, if bwrap doesn't work at runtime, surfaces when the SDK tries to sandbox a Bash command and the worker's session will report it.

**Verification**: Manual verification on Linux.

### Step 4: Phase 1 tests

**Files**: `apps/daemon/tests/services/sdk-runner.test.ts`
**Addresses**: REQ-SBX-10 (tests 1-5)

Add a new `describe("sandbox injection")` block in the `prepareSdkSession` test suite.

Note: these fixtures use the current `ResolvedToolSet` shape (no `canUseToolRules` field). When Step 5 adds `canUseToolRules` to `ResolvedToolSet`, the fixture update pass will add `canUseToolRules: []` to these mocks along with all other affected fixtures.

```typescript
describe("sandbox injection", () => {
  test("includes sandbox in options when worker has Bash in builtInTools", async () => {
    // Worker with Bash
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Read", "Bash"],
        builtInTools: ["Read", "Bash"],
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        tools: context.resolvedTools,
        resourceBounds: {},
      }),
    });

    const result = await prepareSdkSession(makeSpec(), deps);
    assert(result.ok);
    expect(result.result.options.sandbox).toBeDefined();
    expect(result.result.options.sandbox?.enabled).toBe(true);
    expect(result.result.options.sandbox?.autoAllowBashIfSandboxed).toBe(true);
    expect(result.result.options.sandbox?.allowUnsandboxedCommands).toBe(false);
  });

  test("sandbox sets network.allowLocalBinding to false", async () => {
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Bash"],
        builtInTools: ["Bash"],
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        tools: context.resolvedTools,
        resourceBounds: {},
      }),
    });

    const result = await prepareSdkSession(makeSpec(), deps);
    assert(result.ok);
    expect(result.result.options.sandbox?.network?.allowLocalBinding).toBe(false);
  });

  test("does NOT include sandbox when worker has no Bash in builtInTools", async () => {
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Read", "Glob", "Grep"],
        builtInTools: ["Read", "Glob", "Grep"],
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        tools: context.resolvedTools,
        resourceBounds: {},
      }),
    });

    const result = await prepareSdkSession(makeSpec(), deps);
    assert(result.ok);
    expect(result.result.options.sandbox).toBeUndefined();
  });

  test("Dalton-like worker gets sandbox, Thorne-like worker does not", async () => {
    // Dalton: has Bash
    const daltonDeps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash", "Skill", "Task"],
        builtInTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash", "Skill", "Task"],
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        tools: context.resolvedTools,
        resourceBounds: {},
      }),
    });

    const daltonResult = await prepareSdkSession(makeSpec(), daltonDeps);
    assert(daltonResult.ok);
    expect(daltonResult.result.options.sandbox?.enabled).toBe(true);

    // Thorne: no Bash
    const thorneDeps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Read", "Glob", "Grep"],
        builtInTools: ["Read", "Glob", "Grep"],
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        tools: context.resolvedTools,
        resourceBounds: {},
      }),
    });

    const thorneResult = await prepareSdkSession(
      { ...makeSpec(), workerName: "Thorne" },
      thorneDeps,
    );
    assert(thorneResult.ok);
    expect(thorneResult.result.options.sandbox).toBeUndefined();
  });
});
```

The test helpers `makeDeps` and `makeSpec` follow existing patterns in the file (they create `SessionPrepDeps` and `SessionPrepSpec` with sensible defaults). If these helpers don't exist by name, adapt to whatever naming the file uses. The key mock fixtures set up `builtInTools` with or without `"Bash"` to exercise the condition.

**Verification**: `bun test apps/daemon/tests/services/sdk-runner.test.ts` passes.

---

## Phase 2: Worker-Defined `canUseTool` Rules

Phase 2 depends on Phase 1 being complete. The two phases share the same files but address different enforcement gates.

### Step 5: Type changes and toolbox resolver passthrough

**Files**: `lib/types.ts`, `apps/daemon/services/toolbox-resolver.ts`
**Addresses**: REQ-SBX-11, REQ-SBX-17, REQ-SBX-19

**lib/types.ts**: Add `CanUseToolRule` interface after `ResolvedToolSet` (around line 227). Add `canUseToolRules?: CanUseToolRule[]` to `WorkerMetadata`. Add `canUseToolRules: CanUseToolRule[]` (required, defaults to `[]`) to `ResolvedToolSet`.

```typescript
export interface CanUseToolRule {
  /** The built-in tool this rule applies to. Must be in builtInTools. */
  tool: string;
  /** Command patterns to match (Bash tool only). Glob patterns supported. */
  commands?: string[];
  /** File path patterns to match (Read, Write, Edit, Glob, Grep). Glob patterns supported. */
  paths?: string[];
  /** Whether to allow or deny the call when this rule matches. */
  allow: boolean;
  /** Denial message shown in the session when allow is false. */
  reason?: string;
}

export interface ResolvedToolSet {
  mcpServers: McpSdkServerConfigWithInstance[];
  allowedTools: string[];
  builtInTools: string[];
  canUseToolRules: CanUseToolRule[];
}
```

Add to `WorkerMetadata`:
```typescript
export interface WorkerMetadata {
  // ... existing fields ...
  builtInTools: string[];
  canUseToolRules?: CanUseToolRule[];
  // ...
}
```

**apps/daemon/services/toolbox-resolver.ts**: Update the return value at line 143:

```typescript
return {
  mcpServers,
  allowedTools,
  builtInTools: worker.builtInTools,
  canUseToolRules: worker.canUseToolRules ?? [],
};
```

**Fixture updates**: Adding `canUseToolRules: CanUseToolRule[]` (required) to `ResolvedToolSet` breaks every test fixture that constructs one without it. Add `canUseToolRules: []` to all fixtures listed in the Codebase Context table. This is the same mechanical update pattern from the TAE plan.

**Verification**: `bun run typecheck` passes after fixture updates.

### Step 6: Package validation and schema update

**Files**: `lib/packages.ts`
**Addresses**: REQ-SBX-15, REQ-SBX-24 (test case 10: package validation)

**lib/packages.ts**: Add `canUseToolRuleSchema` and wire it into `workerMetadataSchema`:

```typescript
const canUseToolRuleSchema = z.object({
  tool: z.string(),
  commands: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
  allow: z.boolean(),
  reason: z.string().optional(),
});

export const workerMetadataSchema = z.object({
  // ... existing fields ...
  builtInTools: z.array(z.string()),
  canUseToolRules: z.array(canUseToolRuleSchema).optional(),
  // ...
}).superRefine((data, ctx) => {
  // REQ-SBX-15: canUseToolRules must reference only tools in builtInTools
  if (data.canUseToolRules) {
    for (const rule of data.canUseToolRules) {
      if (!data.builtInTools.includes(rule.tool)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            `canUseToolRules references tool "${rule.tool}" which is not in builtInTools. ` +
            `Declared builtInTools: ${data.builtInTools.join(", ") || "(none)"}`,
          path: ["canUseToolRules"],
        });
      }
    }
  }
});
```

Note: moving from `z.object({...})` to `z.object({...}).superRefine(...)` changes the schema's output type. The `superRefine` receives the parsed data with all defaults applied (e.g., `systemToolboxes` defaults to `[]`). Verify that the rest of `discoverPackages` still works with the refined schema's output type.

**Tests** (add to `lib/tests/packages.test.ts` or a new test file):

```typescript
test("canUseToolRules referencing a tool not in builtInTools is rejected", () => {
  const metadata = {
    type: "worker",
    identity: { name: "Test", description: "test", displayTitle: "Test" },
    posture: "test",
    domainToolboxes: [],
    builtInTools: ["Read", "Glob"],
    checkoutScope: "sparse",
    canUseToolRules: [
      { tool: "Bash", allow: false, reason: "No Bash" },
    ],
  };
  const result = workerMetadataSchema.safeParse(metadata);
  expect(result.success).toBe(false);
});

test("canUseToolRules referencing a tool in builtInTools passes validation", () => {
  const metadata = {
    type: "worker",
    identity: { name: "Test", description: "test", displayTitle: "Test" },
    posture: "test",
    domainToolboxes: [],
    builtInTools: ["Read", "Glob", "Bash"],
    checkoutScope: "sparse",
    canUseToolRules: [
      { tool: "Bash", commands: ["git status"], allow: true },
      { tool: "Bash", allow: false, reason: "Only git status" },
    ],
  };
  const result = workerMetadataSchema.safeParse(metadata);
  expect(result.success).toBe(true);
});
```

**Verification**: `bun test lib/tests/packages.test.ts` passes.

### Step 7: Build and inject `canUseTool` callback in `prepareSdkSession`

**Files**: `apps/daemon/lib/agent-sdk/sdk-runner.ts`, `package.json` (new dependency)
**Addresses**: REQ-SBX-12, REQ-SBX-13, REQ-SBX-14, REQ-SBX-16, REQ-SBX-18, REQ-SBX-20, REQ-SBX-21, REQ-SBX-22

**New dependency**: Add `micromatch` for glob pattern matching:

```bash
bun add micromatch
bun add -D @types/micromatch
```

**apps/daemon/lib/agent-sdk/sdk-runner.ts**: Add `canUseTool` to `SdkQueryOptions` (after `sandbox`):

```typescript
canUseTool?: (
  toolName: string,
  input: unknown,
  options: { signal: AbortSignal }
) => Promise<
  | { behavior: "allow"; updatedInput: unknown }
  | { behavior: "deny"; message: string; interrupt?: boolean }
>;
```

Add a module-level function that builds the callback from rules:

```typescript
import micromatch from "micromatch";

/** Path argument field by tool name (REQ-SBX-12). */
const TOOL_PATH_FIELD: Record<string, string> = {
  Edit: "file_path",
  Read: "file_path",
  Write: "file_path",
  Grep: "path",
  Glob: "path",
};

/**
 * Builds a canUseTool callback from worker-declared rules.
 * Rules are evaluated in declaration order; first match wins.
 * No match = allow (REQ-SBX-14).
 */
function buildCanUseTool(
  rules: CanUseToolRule[],
): SdkQueryOptions["canUseTool"] {
  return async (toolName, input, _options) => {
    const toolInput = input as Record<string, unknown>;

    for (const rule of rules) {
      // Tool name must match (exact, case-sensitive)
      if (rule.tool !== toolName) continue;

      // Check command condition (Bash only)
      if (rule.commands !== undefined) {
        if (toolName !== "Bash" || typeof toolInput.command !== "string") continue;
        if (!micromatch.isMatch(toolInput.command, rule.commands)) continue;
      }

      // Check path condition
      if (rule.paths !== undefined) {
        const pathField = TOOL_PATH_FIELD[toolName];
        if (!pathField || typeof toolInput[pathField] !== "string") continue;
        if (!micromatch.isMatch(toolInput[pathField] as string, rule.paths)) continue;
      }

      // Rule matches
      if (rule.allow) {
        return { behavior: "allow", updatedInput: input };
      }
      return {
        behavior: "deny",
        message: rule.reason ?? "Tool call denied by worker policy",
        interrupt: false,
      };
    }

    // No rule matched: allow (REQ-SBX-14)
    return { behavior: "allow", updatedInput: input };
  };
}
```

In `prepareSdkSession`, after sandbox injection (step 5d), add canUseTool injection:

```typescript
// 5e. Build canUseTool callback from worker rules (REQ-SBX-20, REQ-SBX-21)
const canUseToolRules = activation.tools.canUseToolRules;
const canUseToolCallback = canUseToolRules.length > 0
  ? buildCanUseTool(canUseToolRules)
  : undefined;
```

Then add to the options object:

```typescript
const options: SdkQueryOptions = {
  // ... existing fields ...
  ...(sandboxSettings ? { sandbox: sandboxSettings } : {}),
  ...(canUseToolCallback ? { canUseTool: canUseToolCallback } : {}),
  // ... rest ...
};
```

Key points from the spec:
- `canUseToolRules.length > 0` check means no callback is injected for workers without rules (REQ-SBX-21). This avoids function-call overhead on every tool invocation for workers that don't need it.
- `interrupt: false` on denial (REQ-SBX-16): a denied tool call does not abort the session.
- Glob matching uses `micromatch.isMatch()` (REQ-SBX-13) which supports standard glob syntax.
- `TOOL_PATH_FIELD` maps tool names to their path argument field (REQ-SBX-12).
- When both `commands` and `paths` are specified, both must match (AND semantics per REQ-SBX-12).

**Verification**: `bun run typecheck` passes.

### Step 8: Phase 2 tests

**Files**: `apps/daemon/tests/services/sdk-runner.test.ts`, `apps/daemon/tests/toolbox-resolver.test.ts`
**Addresses**: REQ-SBX-24 (test cases 1-9: toolbox resolver + SDK runner)

**Toolbox resolver tests** (`apps/daemon/tests/toolbox-resolver.test.ts`):

```typescript
test("resolveToolSet returns canUseToolRules: [] when worker has no rules", async () => {
  const worker = makeWorker({ builtInTools: ["Read", "Glob"] });
  const result = await resolveToolSet(worker, [], testContext());
  expect(result.canUseToolRules).toEqual([]);
});

test("resolveToolSet returns canUseToolRules matching worker declaration", async () => {
  const rules = [
    { tool: "Bash", commands: ["git status"], allow: true },
    { tool: "Bash", allow: false, reason: "Only git status" },
  ];
  const worker = makeWorker({
    builtInTools: ["Read", "Bash"],
    canUseToolRules: rules,
  });
  const result = await resolveToolSet(worker, [], testContext());
  expect(result.canUseToolRules).toEqual(rules);
});
```

**SDK runner tests** (`apps/daemon/tests/services/sdk-runner.test.ts`):

Add a `describe("canUseTool callback")` block:

```typescript
describe("canUseTool callback", () => {
  test("prepareSdkSession does NOT include canUseTool when rules are empty", async () => {
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Read"],
        builtInTools: ["Read"],
        canUseToolRules: [],
      }),
      // ... activateWorker ...
    });
    const result = await prepareSdkSession(makeSpec(), deps);
    assert(result.ok);
    expect(result.result.options.canUseTool).toBeUndefined();
  });

  test("prepareSdkSession includes canUseTool when rules are non-empty", async () => {
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Read", "Bash"],
        builtInTools: ["Read", "Bash"],
        canUseToolRules: [{ tool: "Bash", allow: false, reason: "No Bash" }],
      }),
      // ... activateWorker ...
    });
    const result = await prepareSdkSession(makeSpec(), deps);
    assert(result.ok);
    expect(result.result.options.canUseTool).toBeDefined();
    expect(typeof result.result.options.canUseTool).toBe("function");
  });

  test("canUseTool allows call when no rule matches", async () => {
    // Only a rule for Bash; call Edit
    const deps = makeDeps({ /* rules for Bash only */ });
    const result = await prepareSdkSession(makeSpec(), deps);
    assert(result.ok);
    const decision = await result.result.options.canUseTool!(
      "Edit",
      { file_path: "/some/file.ts" },
      { signal: new AbortController().signal },
    );
    expect(decision.behavior).toBe("allow");
  });

  test("canUseTool denies Bash call matching a catch-all deny rule", async () => {
    // Catch-all deny for Bash
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Bash"],
        builtInTools: ["Bash"],
        canUseToolRules: [
          { tool: "Bash", allow: false, reason: "All Bash denied" },
        ],
      }),
      // ... activateWorker ...
    });
    const result = await prepareSdkSession(makeSpec(), deps);
    assert(result.ok);
    const decision = await result.result.options.canUseTool!(
      "Bash",
      { command: "rm -rf /" },
      { signal: new AbortController().signal },
    );
    expect(decision.behavior).toBe("deny");
    if (decision.behavior === "deny") {
      expect(decision.message).toBe("All Bash denied");
    }
  });

  test("allowlist: allows git status, denies rm -rf", async () => {
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Bash"],
        builtInTools: ["Bash"],
        canUseToolRules: [
          { tool: "Bash", commands: ["git status", "git log"], allow: true },
          { tool: "Bash", allow: false, reason: "Only git status and git log" },
        ],
      }),
      // ... activateWorker ...
    });
    const result = await prepareSdkSession(makeSpec(), deps);
    assert(result.ok);

    const allowDecision = await result.result.options.canUseTool!(
      "Bash",
      { command: "git status" },
      { signal: new AbortController().signal },
    );
    expect(allowDecision.behavior).toBe("allow");

    const denyDecision = await result.result.options.canUseTool!(
      "Bash",
      { command: "rm -rf /" },
      { signal: new AbortController().signal },
    );
    expect(denyDecision.behavior).toBe("deny");
  });

  test("path-based deny: blocks Edit to **/.ssh/**, allows .lore/", async () => {
    // Use absolute paths, not ~-relative. The SDK delivers file_path as
    // absolute paths (e.g., /home/user/.ssh/id_rsa). Worker packages should
    // declare patterns that match absolute paths.
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Edit"],
        builtInTools: ["Edit"],
        canUseToolRules: [
          { tool: "Edit", paths: ["**/.ssh/**"], allow: false, reason: "Cannot edit credentials" },
        ],
      }),
      // ... activateWorker ...
    });
    const result = await prepareSdkSession(makeSpec(), deps);
    assert(result.ok);

    const denyDecision = await result.result.options.canUseTool!(
      "Edit",
      { file_path: "/home/user/.ssh/id_rsa" },
      { signal: new AbortController().signal },
    );
    expect(denyDecision.behavior).toBe("deny");

    const allowDecision = await result.result.options.canUseTool!(
      "Edit",
      { file_path: "/home/user/project/.lore/specs/example.md" },
      { signal: new AbortController().signal },
    );
    expect(allowDecision.behavior).toBe("allow");
  });

  test("denial sets interrupt: false", async () => {
    const deps = makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Bash"],
        builtInTools: ["Bash"],
        canUseToolRules: [
          { tool: "Bash", allow: false, reason: "Denied" },
        ],
      }),
      // ... activateWorker ...
    });
    const result = await prepareSdkSession(makeSpec(), deps);
    assert(result.ok);

    const decision = await result.result.options.canUseTool!(
      "Bash",
      { command: "anything" },
      { signal: new AbortController().signal },
    );
    expect(decision.behavior).toBe("deny");
    if (decision.behavior === "deny") {
      expect(decision.interrupt).toBe(false);
    }
  });
});
```

**Verification**: `bun test apps/daemon/tests/services/sdk-runner.test.ts` and `bun test apps/daemon/tests/toolbox-resolver.test.ts` pass.

### Step 9: Full suite verification and spec validation

**Addresses**: All REQ-SBX-* via automated verification

Run the full check sequence:

1. `bun run typecheck` passes (no compile errors from `canUseToolRules` on `ResolvedToolSet`)
2. `bun run lint` passes
3. `bun test` passes (all existing + new tests)

Then launch a fresh-context sub-agent to validate the implementation against the spec. The validator should confirm:

1. `prepareSdkSession` injects `sandbox` when `builtInTools` includes `"Bash"` and omits it otherwise
2. Sandbox settings match REQ-SBX-3 exactly (four fields, no extras)
3. `canUseTool` callback is built only when `canUseToolRules` is non-empty
4. Rule matching follows declaration order, first match wins
5. Denial returns `interrupt: false`
6. Package validation rejects `canUseToolRules` referencing tools not in `builtInTools`
7. No other callers of `prepareSdkSession` or `ResolvedToolSet` are broken

## Delegation Guide

Phase 1 is small (2 production files, 1 startup check). Phase 2 is moderate (3 production files, 1 new dependency, more test surface).

**Dalton (implementation)**: Steps 1-3 (Phase 1 production code) and Steps 5-7 (Phase 2 production code + fixture updates). The `micromatch` dependency (Step 7) is the only external addition. The fixture updates for `canUseToolRules: []` across 4 test files are mechanical.

**Sable (testing)**: Steps 4, 8 (all new test cases). Phase 1 tests are straightforward (check presence/absence of sandbox settings). Phase 2 tests exercise the `canUseTool` callback with various rule configurations. Sable should also run the full suite to confirm no regressions.

**Thorne (review)**: Step 9 (fresh-context validation against spec). Primary concerns:
- Confirm `buildCanUseTool` handles all REQ-SBX-12 edge cases (both conditions absent, path-only rules, command-only rules, both conditions present).
- Confirm `micromatch` glob behavior matches the spec's examples (`git*`, `*.lore/**`, `/home/**`).
- Confirm the `TOOL_PATH_FIELD` mapping covers all tools listed in REQ-SBX-12.

### Commission structure

| Commission | Worker | Steps | Can start when | Phase |
|-----------|--------|-------|----------------|-------|
| A: Phase 1 implementation | Dalton | 1, 2, 3 | Now | 1 |
| B: Phase 1 tests | Sable | 4 | Commission A complete | 1 |
| C: Phase 2 types + validation + fixture updates | Dalton | 5, 6 + all fixture updates | Commission A complete | 2 |
| D: Phase 2 callback + dependency | Dalton | 7 | Commission C complete | 2 |
| E: Phase 2 tests | Sable | 8 | Commission D complete | 2 |
| F: Verify + Review | Thorne | 9 | Commission E complete | 2 |

**B and C can run in parallel.** Commission B (Phase 1 tests) uses the current `ResolvedToolSet` shape without `canUseToolRules`. Commission C adds `canUseToolRules` to the type and updates all fixtures (including the Phase 1 test fixtures from Commission B). If C merges after B, it adds `canUseToolRules: []` to the Phase 1 test mocks in the same commit as all other fixture updates. If B merges after C, B's tests already compile because the fixture update pass has landed.

**Pre-commit hook constraint**: Step 5 adds `canUseToolRules` to `ResolvedToolSet`, which breaks typecheck until all fixtures are updated. Dalton must include fixture updates in the same commit as the type change (same pattern as the TAE plan). Steps 1-3 don't have this problem since `sandbox` is added to `SdkQueryOptions` as optional with no downstream fixture impact.

**Collapsed alternative**: Commissions A and B could be a single Dalton commission (Steps 1-4) since Phase 1 is small. Similarly, C and D could be collapsed. The split above maximizes parallelism between Dalton and Sable, but a single-commission approach per phase is also viable.

## Open Questions

**Glob matching for `~` expansion.** `micromatch` treats `~` as a literal character, not the home directory. The SDK delivers `input.file_path` as an absolute path (e.g., `/home/user/.ssh/id_rsa`), so worker packages should declare rules with absolute-compatible patterns like `**/.ssh/**` rather than `~/.ssh/**`. The spec's `~/.ssh/**` example is illustrative. This should be documented in the package authoring guide, not fixed in the matching code. The Phase 2 test fixtures in Step 8 use absolute paths to reflect real-world behavior.

**`superRefine` on `workerMetadataSchema`.** Adding `superRefine` changes the schema from `z.object(...)` to `z.object(...).superRefine(...)`. Verify that no call site depends on the output being a plain `z.ZodObject` (e.g., for `.extend()` or `.merge()`). The `packageMetadataSchema` union (`z.union([workerMetadataSchema, toolboxMetadataSchema])`) should handle refined schemas fine, but confirm during implementation.

**`micromatch` import style.** Step 7 uses `import micromatch from "micromatch"`. Depending on how `@types/micromatch` declares exports, the working import may need to be `import * as micromatch from "micromatch"` or `import { isMatch } from "micromatch"`. Verify the actual types after `bun add`. Run `bun add micromatch && bun add -D @types/micromatch` before writing the import or typecheck will fail.
