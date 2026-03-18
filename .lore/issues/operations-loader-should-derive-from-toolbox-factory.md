---
title: Operations loader should derive from toolboxFactory, not a separate operationFactory
date: 2026-03-17
status: open
tags: [architecture, operations, toolbox, packages]
modules: [daemon]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/design/package-operation-handler.md
---

# Issue: Operations loader should derive from toolboxFactory, not a separate operationFactory

## Problem

The operations loader (`daemon/services/operations-loader.ts`, currently `skill-loader.ts`) looks for a separate `operationFactory` export in package `index.ts` files. The original intent was for the loader to derive REST/CLI operation definitions from the existing `toolboxFactory` export, which already defines the MCP tools a package contributes.

Instead, what was built is a parallel factory contract (`OperationFactory`) with its own handler types (`OperationHandler`, `OperationStreamHandler`), its own deps interface (`OperationFactoryDeps`), and its own validation. Packages would need to export both a `toolboxFactory` (for agents) and an `operationFactory` (for REST/CLI), defining the same capabilities twice with different handler contracts. No packages do this today.

## Expected Behavior

The operations loader should read the `toolboxFactory` export and derive operation definitions from it. One source of truth, two surfaces: MCP tools for agents, REST/CLI operations for humans. The REST route handlers should be thin wrappers around the existing daemon services, not a parallel handler system.

## Current Behavior

The loader looks for a standalone `operationFactory` export that no packages provide. The built-in route factories already define their operations separately from their MCP tools, which works fine for daemon-internal routes. The issue is specifically about package-contributed operations, where the toolbox is the natural source of truth.

## Impact

Low. No packages currently export `operationFactory`. The infrastructure exists but has zero consumers. This is a design gap, not a bug.

## Notes

This issue should be addressed when a package first needs to contribute REST/CLI operations. Until then, the loader infrastructure can sit idle.
