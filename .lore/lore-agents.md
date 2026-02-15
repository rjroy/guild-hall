# Lore Agents

Specialized agents available for lore-development work in this project.

Last updated: 2026-02-15

## Implementation

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| general-purpose | General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks | Default implementation agent for multi-step work |
| lore-development:lore-researcher | Research agent with access to all tools | Deep research requiring comprehensive tool access |

> `/implement` maps its three roles to registry categories: Implementation for code writing, Testing for test execution, Code Quality for review. When a category has no agents, `/implement` falls back to built-in defaults.

## Discovery

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| Explore | Fast agent specialized for exploring codebases | Quick/medium/thorough codebase exploration, finding patterns across files |
| lore-development:surface-surveyor | Entry point discovery for progressive feature excavation | During excavation, finding API endpoints, route handlers, MCP server entry points |

## Documentation Review

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| lore-development:spec-reviewer | Fresh-context review of specs | After completing a spec, when docs feel unclear |
| lore-development:design-reviewer | Fresh-context review of designs | After completing a design, when technical approach feels uncertain |
| lore-development:plan-reviewer | Fresh-context review of plans | After completing a plan, checks requirement coverage and goal alignment |
| lore-development:fresh-lore | Fresh-context analysis using lore-development skills | When conversation is too deep in the weeds, need second opinion from outside accumulated context |

## Security

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| pr-review-toolkit:silent-failure-hunter | Identifies silent failures, inadequate error handling, inappropriate fallback behavior | API route error handling, session management, MCP server integration, Agent SDK error flows |

## Architecture

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| Plan | Software architect agent for designing implementation plans | Architectural decisions, identifies critical files, considers trade-offs |

## Performance

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| - | *No performance-specific agents currently available* | - |

## Testing

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| pr-review-toolkit:pr-test-analyzer | Reviews pull requests for test coverage quality and completeness | PR review, ensuring new functionality has adequate test coverage |

## Code Quality

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| code-simplifier | Simplifies and refines code for clarity, consistency, and maintainability | After completing a logical chunk of code, focuses on recently modified code |
| pr-review-toolkit:code-reviewer | Reviews code for adherence to project guidelines, style guides, and best practices | After writing/modifying code, before commits or PRs, checks CLAUDE.md compliance |
| pr-review-toolkit:comment-analyzer | Analyzes code comments for accuracy, completeness, and long-term maintainability | After generating documentation, before finalizing PRs with comment changes |
| pr-review-toolkit:type-design-analyzer | Expert analysis of type design (encapsulation, invariant expression) | When introducing new types, during PR creation, when refactoring existing types |

## Project Management

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| compass-rose:backlog-analyzer | Analyzes GitHub Project backlog items for quality and readiness | Reviewing backlog health, recommending best items to work on |
| compass-rose:codebase-scanner | Scans codebase to assess issue relevance based on current state | Reprioritizing backlog, identifying stale issues, finding issues with increased relevance |

## Agent SDK Development

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| agent-sdk-dev:agent-sdk-verifier-ts | Verifies TypeScript Agent SDK applications follow best practices | After creating/modifying Agent SDK integration code (lib/agent.ts, API routes using SDK) |

## Plugin Development

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| plugin-dev:agent-creator | Creates agents for plugins | When building new guild-members plugins that need autonomous agents |
| plugin-dev:plugin-validator | Validates plugin structure and configuration | After creating/modifying guild-members plugins, checking plugin.json validity |
| plugin-dev:skill-reviewer | Reviews skill quality (descriptions, triggering effectiveness) | After creating/modifying plugin skills, ensuring they follow best practices |

## Project-Specific Notes

- **Agent SDK Integration**: Always consult `agent-sdk-dev:agent-sdk-verifier-ts` when modifying `lib/agent.ts` or API routes that use the Agent SDK. The SDK has critical quirks (MCP config format, streaming events, session IDs) documented in CLAUDE.md.
- **API Routes**: Always consult `silent-failure-hunter` for error handling review. This project uses SSE streaming and file-based session storage; silent failures in try/catch blocks can mask fundamental breakage.
- **MCP Plugins**: Guild Hall only supports MCP-only plugins from `guild-members/`. Use `plugin-validator` to ensure plugins follow the discovery pattern.
- **Testing Strategy**: This project uses dependency injection throughout (see CLAUDE.md Critical Lessons). Tests mock dependencies via factory parameters, never `mock.module()` (causes infinite loops in bun).
- **Code Quality**: The DI factory pattern (`createX(deps)` with default export) is applied to SessionStore, AgentManager, MCPManager, ServerContext, NodeSessionStore, NodePluginFs, and route handlers. New modules should follow this pattern.
