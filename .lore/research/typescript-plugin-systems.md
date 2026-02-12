---
title: Plugin Systems in TypeScript Applications
date: 2026-02-11
status: active
tags: [plugin-system, typescript, extensibility, architecture, mcp, frontend]
modules: [guild-hall]
related: [.lore/brainstorm/guild-hall-phase-1.md, .lore/research/agent-native-applications.md]
---

# Research: Plugin Systems in TypeScript Applications

## Summary

Surveyed six major plugin systems (Claude Code, VS Code, Obsidian, Grafana, Backstage, Homebridge) plus general TypeScript plugin patterns. The systems vary widely in complexity but share common structural elements: a manifest for metadata, a discovery mechanism, an activation lifecycle, and extension points that plugins can contribute to.

For Guild Hall, the most relevant models are **Grafana** (dashboard with plugin-contributed panels), **Backstage** (typed extension tree with attachment points), and **Claude Code** (filesystem-driven discovery with MCP integration). The right design borrows from all three.

## Systems Surveyed

### 1. Claude Code Plugins

The system closest to Guild Hall's domain. Filesystem-based, markdown-driven, minimal manifest.

**Manifest**: `.claude-plugin/plugin.json`
```json
{
  "name": "plugin-name",
  "description": "What it does",
  "author": { "name": "Name", "email": "email" }
}
```

**Directory structure**:
```
plugin-name/
├── .claude-plugin/plugin.json
├── .mcp.json              # MCP server config
├── commands/*.md           # Slash commands (user-invoked)
├── agents/*.md             # Subagents (Claude-invoked)
├── skills/*/SKILL.md       # Contextual guidance
├── hooks/hooks.json        # Event hooks
└── README.md
```

**Key patterns**:
- **Feature types are directories**: commands/, agents/, skills/, hooks/. Each is a different extension point.
- **Markdown as code**: Commands, agents, and skills are markdown files with YAML frontmatter. The content IS the prompt/instruction.
- **MCP integration**: `.mcp.json` declares MCP servers the plugin provides.
- **Discovery**: Filesystem scan. Drop a folder in, it's a plugin.
- **Marketplace**: Registry of known sources (git repos, local dirs, GitHub). Caching with version pinning.
- **Scoping**: Plugins can be user-global or project-specific.
- **Hooks are shell commands**: `hooks.json` points to Python scripts that run on events (PreToolUse, PostToolUse, etc.).
- **`${CLAUDE_PLUGIN_ROOT}`**: Environment variable for self-referencing paths.

**Strengths**: Zero build step for simple plugins. Filesystem transparency. MCP-native. Natural fit for AI agent tooling.

**Weaknesses**: No UI extensibility. No type safety in plugin contracts. Hooks are shell-based (fragile). No dependency management between plugins.

### 2. VS Code Extensions

The gold standard for contribution-point-based extensibility. Package.json as manifest.

**Manifest**: `package.json` with `contributes` field
```json
{
  "name": "my-extension",
  "contributes": {
    "commands": [{ "command": "ext.doThing", "title": "Do Thing" }],
    "views": { "explorer": [{ "id": "myView", "name": "My View" }] },
    "configuration": { "properties": { "ext.setting": { "type": "string" } } },
    "menus": { "editor/context": [{ "command": "ext.doThing", "when": "editorFocus" }] }
  },
  "activationEvents": ["onCommand:ext.doThing"]
}
```

**Key patterns**:
- **32 contribution points**: commands, views, viewsContainers, menus, configuration, keybindings, themes, debuggers, grammars, languages, snippets, customEditors, walkthroughs, authentication, terminal, etc.
- **Declarative registration**: Contributions are JSON declarations, not code. VS Code reads them at startup without loading the extension.
- **Lazy activation**: Extensions load only when their activation events fire. This is how VS Code stays fast with 100+ extensions.
- **Separate process**: Extensions run in an extension host process, isolated from the UI.
- **`when` clauses**: Conditional visibility for commands, menus, views based on editor state.
- **API surface**: Extensions import `vscode` module for runtime interaction. Typed API with full IntelliSense.

**Strengths**: Extremely well-documented. Declarative contribution model scales to thousands of extensions. Lazy loading prevents bloat. Strong typing.

**Weaknesses**: Complex. The 32 contribution points are specific to VS Code's UI model. Heavy tooling requirements (vsce, yo generator).

**Relevance to Guild Hall**: The contribution point pattern is directly applicable. Guild Hall could define contribution points (roster cards, dashboard panels, session tools, settings) and plugins declare what they contribute in their manifest.

### 3. Obsidian Plugins

Desktop app with TypeScript plugins. Class-based lifecycle.

**Manifest**: `manifest.json`
```json
{
  "id": "plugin-id",
  "name": "Plugin Name",
  "version": "1.0.0",
  "minAppVersion": "1.0.0",
  "description": "What it does",
  "author": "Name",
  "authorUrl": "https://...",
  "isDesktopOnly": false
}
```

**Key patterns**:
- **Class inheritance**: Plugins extend `Plugin` class, override `onload()` / `onunload()`.
- **Build step required**: TypeScript compiled to single `main.js` via esbuild or rollup. No dynamic imports.
- **Registration in code**: `this.addCommand()`, `this.registerView()`, `this.addSettingTab()`. Not declarative, but auto-cleaned on unload.
- **Vault as filesystem**: Plugins operate on the user's vault (file system). Reads, writes, metadata.
- **App reference**: Plugin receives `this.app` with access to all core subsystems (workspace, vault, metadataCache).

**Strengths**: Simple mental model (extend class, register things). Clean lifecycle. Users install by dropping files.

**Weaknesses**: No lazy loading (all enabled plugins load at startup). Build step adds friction. No typed contribution points.

### 4. Grafana Plugins

Dashboard application with three plugin types: panel, data source, app.

**Manifest**: `plugin.json`
```json
{
  "type": "panel",
  "name": "My Panel",
  "id": "myorg-mypanel-panel",
  "info": {
    "description": "A custom panel",
    "author": { "name": "Org" },
    "keywords": ["panel"],
    "version": "1.0.0"
  },
  "dependencies": {
    "grafanaVersion": "10.0.x",
    "grafanaDependency": ">=10.0.0"
  }
}
```

**Key patterns**:
- **Three plugin types**: Panel (custom visualizations), Data Source (external connectivity), App (full pages with bundled panels/data sources).
- **React components**: Panel plugins are React components receiving data and options props.
- **Module entry point**: `module.ts` exports the plugin via `PanelPlugin` or `DataSourcePlugin` class.
- **UI extension hooks**: App plugins can hook into core Grafana features.
- **SDK packages**: `@grafana/data`, `@grafana/ui`, `@grafana/runtime`, `@grafana/schema` provide typed APIs.
- **Options editor**: Panel plugins declare configurable options that render in the Grafana UI.

**Strengths**: Clean separation between plugin types. React-based UI contributions. Strong SDK with typed data models. Dashboard paradigm is directly relevant to Guild Hall.

**Weaknesses**: Go backend required for data source plugins with server-side logic. Plugin signing required for production. Build tooling is complex.

**Relevance to Guild Hall**: Grafana's model of "plugins contribute panels to a dashboard" is almost exactly what Guild Hall needs. Guild members could be plugins that contribute cards/panels to the dashboard, tools to the agent, and optionally their own settings UI.

### 5. Backstage (Spotify)

Developer portal with a tree-based extension system. TypeScript throughout.

**Extension definition**:
```typescript
const extension = createExtension({
  name: 'my-extension',
  attachTo: { id: 'parent-id', input: 'content' },
  output: [coreExtensionData.reactElement],
  config: {
    schema: { title: z => z.string().default('Default') }
  },
  *factory({ config, inputs }) {
    yield coreExtensionData.reactElement(<MyComponent title={config.title} />);
  }
});
```

**Key patterns**:
- **Extension tree**: Extensions attach to parents via named inputs. The tree is resolved top-down, instantiated bottom-up.
- **Typed data references**: Extensions communicate via `createExtensionDataRef<Type>()`. Compile-time type safety for what data flows between extensions.
- **Attachment points**: `attachTo: { id: 'parent', input: 'slot' }`. Parents declare inputs; children attach to them.
- **Zod config schemas**: Runtime validation and TypeScript type inference for plugin configuration.
- **Extension boundary**: React error boundaries + Suspense + analytics per extension. Crashes are isolated.
- **Plugin = collection of extensions**: A plugin groups related extensions and provides a namespace.
- **Dynamic loading**: Backend plugins discovered by scanning directories for package.json files.

**Strengths**: Most sophisticated typing. Extension tree model is powerful for composable UIs. Zod validation catches config errors at runtime. Crash isolation.

**Weaknesses**: Highest complexity of all systems surveyed. Steep learning curve. The tree model can be overkill for simple cases.

**Relevance to Guild Hall**: The attachment point model is compelling. Guild Hall could define slots (roster area, dashboard panels, session sidebar, settings) and guild members attach their UI contributions to those slots. The Zod config schema pattern is also directly useful.

### 6. Homebridge

IoT hub with npm-based plugin discovery. Simpler model.

**Key patterns**:
- **npm as plugin registry**: Plugins are npm packages prefixed with `homebridge-`. Discovery via npm search.
- **Dynamic platform plugins**: Can add/remove accessories (devices) at runtime.
- **package.json as manifest**: Standard npm fields plus `homebridge` section for platform/accessory declarations.
- **TypeScript templates**: Official template repo with preconfigured build.

**Strengths**: Leverages npm ecosystem entirely. Zero custom registry. Simple discovery.

**Weaknesses**: Requires npm publish for distribution. No UI extensibility. Runtime type checking only.

**Relevance to Guild Hall**: The npm-based discovery is interesting for a future marketplace, but probably overkill for Phase I where plugins are local directories.

## Cross-Cutting Patterns

### Manifest Design

Every system has a manifest. The spectrum:

| System | Manifest | Declarative UI? | Typed? |
|--------|----------|-----------------|--------|
| Claude Code | plugin.json (minimal) | No | No |
| VS Code | package.json contributes | Yes (32 contribution points) | JSON Schema |
| Obsidian | manifest.json | No (code-based registration) | No |
| Grafana | plugin.json | Partial (type field) | JSON Schema |
| Backstage | Code-based | Yes (extension tree) | Zod + TypeScript |
| Homebridge | package.json | No | No |

**Observation**: The more a system supports UI extensibility, the more declarative and typed its manifest becomes. Guild Hall wants UI extensibility (plugins contribute panels), so the manifest should lean declarative.

### Discovery Mechanisms

| System | Discovery | Hot Reload? |
|--------|-----------|-------------|
| Claude Code | Filesystem scan | Yes (plugin cache) |
| VS Code | Marketplace + local install | Requires reload |
| Obsidian | Community list + vault folder | Requires restart |
| Grafana | Plugin directory scan | Requires restart |
| Backstage | Directory scan for package.json | Backend only |
| Homebridge | npm search + node_modules | Requires restart |

**Observation**: Filesystem scan is the simplest and most transparent. Claude Code and Grafana both use it. For Guild Hall Phase I, directory scanning is sufficient. Hot reload can come later.

### Activation and Lifecycle

| System | When Loaded | Lifecycle |
|--------|-------------|-----------|
| Claude Code | On use (lazy) | No formal lifecycle |
| VS Code | On activation event | activate() / deactivate() |
| Obsidian | On startup | onload() / onunload() |
| Grafana | On dashboard render | React component lifecycle |
| Backstage | On app init (tree resolution) | Factory function |
| Homebridge | On startup | constructor / shutdown |

**Observation**: Lazy loading (VS Code) is ideal for large plugin counts but complex to implement. For Guild Hall Phase I with a modest number of guild members, loading all on startup (Obsidian/Grafana model) is simpler.

### UI Extensibility Patterns

Three approaches to plugin UI contributions:

1. **Contribution points** (VS Code): Plugin declares JSON contributions. Host reads them and renders. Plugin provides handlers. Most declarative.

2. **React component export** (Grafana): Plugin exports a React component. Host renders it in a container with props. Plugin owns its rendering.

3. **Extension tree** (Backstage): Plugin creates typed extensions that attach to named slots in a tree. Parent/child data flow. Most flexible but most complex.

**For Guild Hall**: Start with React component export (Grafana model). Guild members export components that the dashboard renders in designated slots. Evolve toward contribution points if the plugin count grows.

## Recommended Architecture for Guild Hall

Based on this survey, here's a synthesis:

### Manifest: `guild-member.json`

Borrow from Grafana's plugin.json and Claude Code's simplicity:

```json
{
  "name": "github-tools",
  "displayName": "The Scribe",
  "description": "GitHub integration for issues, PRs, and repos",
  "version": "1.0.0",
  "author": { "name": "Guild Hall" },
  "type": "guild-member",
  "mcp": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
  },
  "contributes": {
    "rosterCard": "./components/RosterCard.tsx",
    "settingsPanel": "./components/Settings.tsx"
  }
}
```

Key fields:
- **Identity**: name, displayName, description, version, author
- **MCP config**: How to start the MCP server (stdio, HTTP, or SDK). This is the guild member's tooling.
- **contributes**: What UI components the plugin provides. Phase I: rosterCard only. Later: dashboardPanel, sessionWidget, settingsPanel.

### Discovery: Directory scan

```
guild-members/
├── github-tools/
│   ├── guild-member.json
│   └── components/
├── file-manager/
│   ├── guild-member.json
│   └── components/
```

Backend scans `guild-members/` at startup. Reads manifests. Wires up MCP servers. Serves roster to frontend.

### Lifecycle: Load on startup, activate on use

- **Startup**: Read all manifests, register all guild members in the roster
- **Session start**: Start MCP servers for guild members the session needs
- **Session end**: Optionally shut down idle MCP servers
- **No build step for simple plugins**: If a guild member only provides MCP tools (no UI components), the manifest is enough. UI components require a build step.

### UI Contributions: React components in slots

Phase I slots:
- **Roster card**: How the guild member appears in the roster panel
- Default card if plugin doesn't provide one (name, description, status, tool count)

Future slots:
- **Dashboard panel**: A widget on the main dashboard
- **Session sidebar**: Contextual info during an active session
- **Settings panel**: Plugin-specific configuration UI

### Type Safety: Zod for config, TypeScript interfaces for contributions

Borrow from Backstage: guild member configs validated with Zod at load time. UI contribution interfaces defined as TypeScript types that plugins implement.

## Open Questions

1. **Build step trade-off**: Grafana and Obsidian require a build step for plugins. Claude Code does not. If guild members can contribute React components, they need compilation. Can we support both "MCP-only" plugins (no build) and "full" plugins (with UI components)?

2. **Dynamic import for UI components**: How does the frontend load a plugin's React component at runtime? `React.lazy()` + dynamic import? Module federation? This is a key technical decision.

3. **MCP server lifecycle**: Should MCP servers be long-running (start at app boot) or on-demand (start when a session needs them)? Long-running is simpler but wasteful. On-demand needs connection management.

4. **Plugin isolation**: If a plugin's React component crashes, does it take down the dashboard? Backstage uses ErrorBoundary per extension. Guild Hall should do the same.

5. **Dependency between guild members**: Can one guild member depend on another? Backstage and the well-typed plugin architecture support this. Probably not needed for Phase I.

## Sources

- [VS Code Extension Anatomy](https://code.visualstudio.com/api/get-started/extension-anatomy)
- [VS Code Contribution Points](https://code.visualstudio.com/api/references/contribution-points)
- [VS Code Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)
- [Obsidian Plugin API](https://docs.obsidian.md/Reference/TypeScript+API/Plugin)
- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Grafana Plugin Anatomy](https://grafana.com/developers/plugin-tools/key-concepts/anatomy-of-a-plugin)
- [Grafana Plugin System (DeepWiki)](https://deepwiki.com/grafana/grafana/11-plugin-system)
- [Backstage Frontend Extensions](https://backstage.io/docs/frontend-system/architecture/extensions/)
- [Backstage Technical Overview](https://backstage.io/docs/overview/technical-overview/)
- [Homebridge Plugin Template](https://github.com/homebridge/homebridge-plugin-template)
- [Well-Typed Plugin Architecture](https://code.lol/post/programming/plugin-architecture/)
- [Claude Code Plugin System](file:///home/rjroy/.claude/plugins/) (local exploration)

## Notes

- The Claude Code plugin system is the only one surveyed that's specifically designed for AI agent tooling. Its MCP integration pattern is unique and directly relevant.
- Grafana's dashboard paradigm is the closest match to Guild Hall's UI model.
- Backstage has the most sophisticated type safety but also the steepest learning curve.
- VS Code's contribution point model has survived a decade and thousands of extensions. It works.
- Every system that supports UI extensibility requires a build step for plugins. There's no escaping this if guild members contribute React components.
- The "MCP-only" vs "full" plugin distinction could be Guild Hall's simplifying insight: most guild members just provide tools (no build step), and a few provide both tools and UI (build step required).
