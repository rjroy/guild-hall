---
title: "Art Director Worker: Visual Craft Specialist for Guild Hall"
date: 2026-03-18
status: resolved
author: Celeste
tags: [brainstorm, workers, replicate, domain-toolbox, visual-media, growth-surface]
related:
  - .lore/brainstorm/replicate-native-toolbox.md
  - .lore/research/replicate-image-generation-integration.md
  - .lore/specs/workers/guild-hall-workers.md
  - .lore/specs/workers/guild-hall-worker-roster.md
  - .lore/specs/workers/worker-identity-and-personality.md
  - .lore/specs/workers/guild-hall-visionary-worker.md
  - .lore/specs/workers/guild-hall-steward-worker.md
  - .lore/vision.md
---

# Art Director Worker: Visual Craft Specialist for Guild Hall

**Vision status:** `approved` (v2, 2026-03-17). Alignment analysis applied to all proposals.

**Context scanned:** Vision document (v2), all worker specs (roster, workers, identity, visionary, steward, domain plugins), Replicate native toolbox brainstorm, Replicate integration research, all 9 packages (developer, reviewer, researcher, writer, test-engineer, steward, visionary, replicate toolbox, shared), growth surface brainstorm (2026-03-17), recent git history, CLAUDE.md.

**Recent brainstorm check:** The `replicate-native-toolbox.md` brainstorm defines the tool surface area for the `guild-hall-replicate` package (10 tools across three tiers). That brainstorm is about what tools to build. This brainstorm is about who wields them.

---

## The Question

The `guild-hall-replicate` package exists as a toolbox (`packages/guild-hall-replicate/`). It has a client, a model registry, output handling, and tool definitions. What's missing is a worker who knows how to use these tools with intention. Any worker could declare `domainToolboxes: ["guild-hall-replicate"]` and call `generate_image`. But image generation without creative direction is prompt roulette. The question is: what kind of specialist turns a toolbox into a craft?

---

## Proposal 1: The Role — Guild Illuminator

### Evidence

The existing roster follows a pattern: each worker owns a domain of judgment, not just a set of tools. Dalton doesn't just have Bash; he has an implementer's posture that decides what to build and how to verify it. Verity doesn't just have WebSearch; she has a researcher's posture that evaluates sources and synthesizes findings. Edmund doesn't just have email tools; he has a steward's posture that triages correspondence and maintains structured memory across commissions.

The `guild-hall-replicate` toolbox (`packages/guild-hall-replicate/index.ts`) provides `generate_image`, `edit_image`, `remove_background`, `generate_video`, `list_models`, `get_model_params`, `upscale_image`, `describe_image`, `check_prediction`, and `cancel_prediction`. These are generation mechanics. The judgment layer is missing: which model fits this task? What aspect ratio serves this composition? Should this be a photorealistic render or a stylized illustration? When should the worker iterate on a draft vs. start fresh? How does this image relate to images already generated for the same project?

The medieval guild system had illuminators: the specialists who turned manuscripts into works of visual art. They didn't just apply pigment. They understood the text, chose visual motifs that reinforced meaning, maintained consistency across folios, and made creative decisions about composition, color, and symbol. The parallel to an AI art director is direct.

### Proposal

Create a `guild-hall-illuminator` worker package. The Illuminator is Guild Hall's visual craft specialist: the one who turns prompts into images with creative intention. Where other workers might use `generate_image` as a utility (the way Dalton might use `grep`), the Illuminator treats image generation as its primary craft, with the judgment and iteration that implies.

The worker's domain is not "run Replicate models." It is: understand what visual output the project needs, select appropriate models and parameters, iterate on drafts, maintain visual consistency, and deliver finished assets. The same distinction as Octavia's domain not being "write markdown files" but "document what exists with precision and completeness."

### Rationale

Growth Surface 1 (Domain Independence) says Guild Hall grows by "adding workers and toolboxes for new domains." The Replicate toolbox is the toolbox. The Illuminator is the worker. Together they form a complete visual media domain, following the same pattern as `guild-hall-email` (toolbox) + Edmund (worker).

### Vision Alignment

1. **Anti-goal check:** No conflict. Anti-goal 3 (general-purpose assistant) is the relevant check. The Illuminator is a specialist with a defined visual craft domain, not a generalist who happens to have image tools. The distinction holds: a new domain comes "with its own workers, postures, and toolboxes" (Growth Surface 1).
2. **Principle alignment:** Principle 4 (Metaphor Is Architecture) is directly served. "Illuminator" isn't decoration on a generic image worker. It shapes the posture: illuminators understand context before applying craft, they maintain visual coherence across a body of work, they make compositional decisions. Principle 1 (Artifacts Are the Work) is served: the Illuminator produces image files alongside creative briefs, not conversation.
3. **Tension resolution:** GS-1 (Domain Independence) vs. anti-goal 3 (general-purpose): the Illuminator comes with its own posture, toolbox, and domain, not by asking Dalton to also generate images. This is the growth pattern the vision endorses.
4. **Constraint check:** Depends on `guild-hall-replicate` toolbox, which exists. Depends on `REPLICATE_API_TOKEN`, which follows the two-state factory pattern (brainstorm: `replicate-native-toolbox.md`). No new infrastructure.

### Scope

Small for the worker package itself (4 files: `package.json`, `soul.md`, `posture.md`, `index.ts`). The toolbox already exists. The only new work is the identity, posture, and creative-direction judgment encoded in the worker.

---

## Proposal 2: Capabilities Beyond "Generate an Image"

### Evidence

Looking at how the `art-gen-mcp` server is used in practice (it's configured as an MCP plugin in this project's `.claude/settings.json`), the tools appear in the music-engine-rowan plugin's cover art and hook art agents. Those agents don't just call `generate_image` once. They go through a multi-step creative process: generate a prompt using verbalized sampling, select from multiple candidates, generate the image, potentially edit it, and export the result. This is a workflow, not a single tool call.

The `guild-hall-replicate` brainstorm (`replicate-native-toolbox.md`) describes a common pattern: "generate 4 cheap drafts with Schnell, pick the best one, upscale it." That's creative direction: budget-conscious exploration followed by selective refinement. Another pattern from the brainstorm: `describe_image` to analyze a reference image, then use the description to write a better generation prompt. That's visual research informing creative decisions.

Real visual work involves iteration loops that no single tool call captures:

- **Exploration:** Generate multiple drafts at low cost, evaluate, choose a direction
- **Refinement:** Edit the chosen draft (style transfer, detail enhancement, repainting)
- **Production:** Upscale to final resolution, remove backgrounds for compositing, export
- **Consistency:** Reference previous project images to maintain visual language

### Proposal

The Illuminator's posture should encode these workflow patterns as methodology, the same way Dalton's posture encodes "write tests alongside implementation" and Verity's encodes "cite where each claim came from." The commission types the Illuminator handles:

**Creative direction commissions.** The user describes a need ("cover art for this song," "social media header for the project," "mood board for the visual identity"). The Illuminator reads relevant project context (lyrics, brand docs, previous visual assets), makes creative decisions (style, composition, palette, mood), articulates those decisions in a brief, then executes through the toolbox. The brief is an artifact. The images are artifacts. Both survive the commission.

**Asset pipeline commissions.** The user has specific production needs: "generate 5 variations of this logo concept," "remove backgrounds from all the images in `.lore/generated/`," "upscale these drafts to print resolution." The Illuminator handles the batch workflow with creative oversight, not just mechanical execution. It checks quality, flags problems, and makes judgment calls about which outputs meet the standard.

**Visual consistency commissions.** The user has a project with an established visual language and needs new assets that match. The Illuminator reads existing visual assets (using `describe_image` on them), extracts the style parameters, and uses those as constraints on new generation. This is where memory becomes load-bearing: the Illuminator maintains a visual style memory across commissions.

**Style guide commissions.** The user wants to establish a visual identity for a project. The Illuminator generates exploration sets across different styles, presents them with rationale, and once the user selects a direction, documents it as a visual style guide artifact in `.lore/`. Future commissions reference this guide for consistency.

### Rationale

Without these workflow patterns in the posture, the Illuminator is just a worker that happens to have image tools. The workflow patterns are what make it a specialist. They're the equivalent of Octavia's "excavate features from code" workflow or Edmund's "read memory before triaging" workflow. Tools are capabilities. Workflows are craft.

### Vision Alignment

1. **Anti-goal check:** No conflict. The Illuminator's commission types are bounded and specific. Each produces durable artifacts (Principle 1). None require self-modifying identity (anti-goal 4).
2. **Principle alignment:** Principle 1 (Artifacts Are the Work) is central. Every commission type produces artifacts: creative briefs, image files, style guides. The brief artifact is the differentiator. A worker that generates images without articulating its creative decisions in a durable document is losing the intelligence that informed the output.
3. **Tension resolution:** No active tension. The workflow patterns are domain-specific methodology, not general-purpose capability.
4. **Constraint check:** All workflows use existing toolbox capabilities. No new tools required beyond what the `replicate-native-toolbox.md` brainstorm already proposes.

### Scope

Medium. The capability descriptions live in the posture file, not in code. But writing a posture that genuinely teaches the model creative direction (not just "generate images") requires careful calibration.

---

## Proposal 3: Toolbox and Tool Access

### Evidence

The existing worker packages show a clear pattern for tool declarations:

| Worker | Domain Toolboxes | Built-in Tools | Checkout Scope |
|--------|-----------------|----------------|----------------|
| Dalton (Developer) | none | Skill, Task, Read, Glob, Grep, Write, Edit, Bash | full |
| Octavia (Writer) | none | Skill, Task, Read, Glob, Grep, Write, Edit, Bash | full |
| Verity (Researcher) | none | Skill, Task, Read, Glob, Grep, WebSearch, WebFetch, Write, Edit, Bash | sparse |
| Edmund (Steward) | guild-hall-email | Read, Glob, Grep, Write, Edit | sparse |
| Celeste (Visionary) | none | Skill, Task, Read, Glob, Grep, Write, Edit, Bash | full |

Edmund's pattern is the closest precedent: a specialist worker whose primary capability comes from a domain toolbox. The Steward doesn't need the full codebase; it needs the inbox. Similarly, the Illuminator doesn't need to read source code; it needs to generate and manage visual assets.

The Illuminator needs to read project context (specs, briefs, previous commission results) to inform creative decisions, and it needs to write artifacts (creative briefs, style guides) alongside the images the toolbox produces. It needs to read existing images in the project to maintain visual consistency. But it doesn't need Bash, WebSearch, or WebFetch.

### Proposal

```json
{
  "guildHall": {
    "type": "worker",
    "identity": {
      "name": "...",
      "description": "...",
      "displayTitle": "Guild Illuminator",
      "portraitPath": "/images/portraits/...-illuminator.webp"
    },
    "model": "sonnet",
    "domainToolboxes": ["guild-hall-replicate"],
    "domainPlugins": [],
    "builtInTools": ["Read", "Glob", "Grep", "Write", "Edit"],
    "checkoutScope": "sparse",
    "resourceDefaults": {
      "maxTurns": 120
    }
  }
}
```

Key decisions and their rationale:

**`domainToolboxes: ["guild-hall-replicate"]`** — The primary capability. All 10 Replicate tools (generate, edit, remove background, video, list models, get params, upscale, describe, check, cancel) become available.

**`checkoutScope: "sparse"`** — The Illuminator reads `.lore/` for project context (briefs, specs, style guides, previous commissions) and writes to `.lore/` (creative briefs, style guides). It does not need source code, tests, or build configuration. Sparse checkout is the right boundary, matching Edmund's pattern.

**`builtInTools: ["Read", "Glob", "Grep", "Write", "Edit"]`** — Base file tools for reading context and writing artifacts. No Bash (no shell commands needed for visual work). No WebSearch/WebFetch (visual references come from the project's own assets and the Replicate toolbox, not from web scraping). No Skill or Task (the Illuminator's work is self-contained within the domain toolbox).

**`model: "sonnet"`** — This is the key divergence from other specialist workers. Image generation work doesn't require the deep multi-source synthesis that Opus excels at (Celeste reading 50 files to produce a brainstorm, Octavia reconciling requirements across specs). The Illuminator's reasoning is: read a brief, make creative decisions, call tools, iterate. Sonnet handles this well and the cost difference matters when the commission also incurs Replicate API costs. The image generation itself is the expensive part, not the reasoning around it.

**`maxTurns: 120`** — Higher than Edmund (80) or Celeste (80) because image generation workflows involve iteration loops: generate drafts, evaluate, refine, generate again. Each `generate_image` call is a tool turn. A commission that generates 4 drafts, picks one, edits it twice, and upscales it is already 8 tool turns just for Replicate calls, plus the file reads, writes, and evaluation reasoning.

**No `canUseToolRules`** — Unlike Celeste and Octavia, the Illuminator has no Bash access to restrict. The domain toolbox handles all external API calls. The Write/Edit tools are constrained by posture (write to `.lore/` only), following the same pattern as other workers.

### Rationale

The tool set is minimal by design. Every tool the Illuminator has serves visual craft: reading context, generating images, writing briefs and style guides. No tool exists "just in case." This follows the vision's Principle 6 (Tools Are Atomic): the tools are mechanics, the Illuminator's posture provides the judgment.

### Vision Alignment

1. **Anti-goal check:** No conflict. The tool set is focused, not general-purpose.
2. **Principle alignment:** Principle 6 (Tools Are Atomic, Judgment Is the Agent's) is the primary alignment. The Replicate tools generate images; the Illuminator decides what to generate. Principle 5 (One Boundary) is respected: the Replicate toolbox is a daemon-registered toolbox, not client-side logic.
3. **Tension resolution:** No active tension.
4. **Constraint check:** Depends on `guild-hall-replicate` package, which exists. `REPLICATE_API_TOKEN` follows the two-state factory pattern. Sonnet model ID (`claude-sonnet-4-6`) is available per system context.

### Scope

Small. Package metadata declaration only. The toolbox already exists.

---

## Proposal 4: Interaction Patterns — Meetings vs. Commissions

### Evidence

The existing workers split across two interaction patterns:

- **Commission-primary:** Dalton, Verity, Sable, Celeste. These workers do autonomous work and submit results. The user reviews after the fact.
- **Meeting-enabled:** All workers can participate in meetings, but some benefit more from synchronous collaboration. Octavia and Edmund's work often involves back-and-forth: "what about this thread?" or "revise the spec to cover this edge case."

Creative direction is inherently collaborative. A designer showing three logo concepts and asking "which direction?" is a meeting pattern. A designer executing on an approved concept is a commission pattern. The Illuminator's work spans both.

The music-engine-rowan plugin's cover-art-generator agent demonstrates the commission pattern: it generates prompts via verbalized sampling, selects a candidate, generates the image, and delivers. But the hook-art-generator agent shows a more interactive pattern: it starts from an existing image, generates a video, and the user decides if the motion matches their vision. That's closer to a meeting.

### Proposal

The Illuminator should be **commission-primary but meeting-ready.** Most visual work follows a commission pattern: the user describes what they need, the Illuminator makes creative decisions and produces artifacts. The user reviews the result (images + creative brief) and either accepts or commissions revisions.

Meetings are valuable for two specific scenarios:

1. **Visual exploration sessions.** The user and Illuminator co-develop a visual direction. The user provides verbal feedback ("darker, more textured, less corporate"), the Illuminator generates iterations in real-time. This is the "show three concepts, get feedback, iterate" loop that defines collaborative creative work.

2. **Style guide development.** Building a project's visual identity requires conversation. The Illuminator presents options, the user reacts, and the guide emerges from the exchange. This is harder to do asynchronously because creative preferences are difficult to articulate in a commission prompt.

The posture should encode when to suggest a meeting vs. proceed autonomously. The heuristic: if the commission prompt is specific enough to act on ("generate cover art in the style of the existing album art, 16:9, dark palette"), proceed. If it's exploratory ("we need a visual identity for this project"), the Illuminator's commission result should include initial explorations and a suggestion to meet for refinement.

### Rationale

Forcing all visual work into commissions loses the conversational feedback loop that makes creative collaboration productive. Forcing all visual work into meetings wastes synchronous time on production work that doesn't need human input. The split matches how creative directors actually work: brief, explore, present, refine (meeting), then execute (commission).

### Vision Alignment

1. **Anti-goal check:** Anti-goal 5 (real-time collaborative editing) is the relevant check. Meetings are conversations, not co-editing sessions. The Illuminator generates images and presents them; the user provides direction verbally. This is within the meeting model. No conflict.
2. **Principle alignment:** Principle 2 (User Decides Direction) is served by the meeting pattern for exploratory work. The user holds authority over creative direction. Principle 1 (Artifacts Are the Work) is served by the commission pattern for production work. Generated images and briefs are the durable output.
3. **Tension resolution:** No active tension. The meeting/commission split is the system's existing interaction model.
4. **Constraint check:** No new infrastructure. Both interaction modes exist.

### Scope

Small. Encoded in posture content, not in code.

---

## Proposal 5: Worker Relationships and Memory

### Evidence

Edmund maintains structured memory files across commissions (`contacts.md`, `preferences.md`, `active-threads.md`). This pattern works because email triage is cumulative: the Steward gets better at its job as it learns the user's contacts and priorities. Visual craft is similarly cumulative: the Illuminator gets better as it learns a project's visual language, the user's style preferences, and which generation models produce the best results for this kind of work.

The worker roster has natural collaboration seams:

- **Octavia writes copy; the Illuminator illustrates.** A commissioned blog post needs a header image. A spec needs a diagram. A brainstorm needs a concept sketch to communicate a UI idea. Today, Octavia writes "add an image here" and the user figures it out.
- **Dalton builds UI; the Illuminator provides assets.** A commissioned web page needs hero images, icons, or background textures. Today, Dalton uses placeholder images or the user provides them.
- **Celeste envisions; the Illuminator visualizes.** A brainstorm about a new feature could include concept mockups that make the proposal tangible. Today, proposals are text-only.

The worker-to-worker mail system (`send_mail`) already handles inter-worker consultation. Dalton could mail the Illuminator: "I'm building a landing page for [project]. What image assets should I plan for?" The Illuminator responds with a creative brief. But this requires Dalton to know the Illuminator exists and decide to consult it. The Growth Surface brainstorm's Proposal 6 (`list_guild_capabilities`) would solve the discovery problem. Without it, relationships depend on the user or Guild Master routing work.

### Proposal

**Memory structure.** The Illuminator maintains two structured memory files:

1. **`visual-language.md`** — Per-project visual style notes. What colors, textures, aspect ratios, and model configurations work for this project. Updated at the end of each commission. Read at the start of each commission to maintain consistency. Format: project name, style descriptors, preferred models, reference images, notes.

2. **`generation-log.md`** — Recent generation history. What was generated, which model, what worked, what didn't. Not a complete log (that's the commission artifact), but a curated memory of lessons learned. "FLUX Schnell produces washed-out results for dark moody scenes; use FLUX Pro with guidance_scale 7+ instead."

**Inter-worker relationships.** Encoded in posture, not in code:

- When the Illuminator receives a commission that references another worker's output (e.g., "illustrate Octavia's blog post at `.lore/specs/...`"), it reads that artifact for context.
- When the Illuminator's commission result would be useful to another worker's ongoing commission, it notes this in the result summary. The Guild Master decides whether to route it.
- The Illuminator does not mail other workers proactively. It's a production specialist, not a coordinator. If coordination is needed, it goes through the Guild Master.

**The Pencil MCP question.** The commission prompt asks about access to `.pen` files via the Pencil MCP. This is a compelling extension: the Illuminator could generate UI mockups, design explorations, or visual assets directly in Pencil's design canvas. But it introduces significant complexity: the Pencil MCP has its own design system, layout engine, and component model. Integrating it would make the Illuminator a design tool operator, not just an image generation specialist. Recommendation: defer Pencil integration to a future spec. The initial Illuminator should master image generation craft first. Pencil integration is a natural Growth Surface 3 (Worker Growth) expansion: "a toolbox that gives a worker access to [new capabilities] expands what that worker can do without changing how workers work."

### Rationale

Memory makes the Illuminator a persistent creative collaborator rather than a stateless image generator. Each commission benefits from the accumulated visual knowledge of previous commissions. The `visual-language.md` file is the equivalent of a designer's brand book, updated organically through work rather than prescribed upfront.

### Vision Alignment

1. **Anti-goal check:** Anti-goal 4 (self-modifying worker identities) is the relevant check. Memory accumulation (learning project style preferences) is explicitly allowed by REQ-WKR-4 and the vision's note that "memory accumulates across tasks and meetings, but character is fixed." Visual style memory is project knowledge, not identity drift.
2. **Principle alignment:** Principle 3 (Files Are Truth) is served: memory files are plain markdown, inspectable and editable. Principle 1 (Artifacts Are the Work) is served: creative briefs and style guides are durable artifacts, not conversation ephemera.
3. **Tension resolution:** No active tension.
4. **Constraint check:** Memory system exists. Worker-scoped memory is the standard mechanism. No new infrastructure.

### Scope

Small for the memory structure (defined in posture, maintained by the worker). Medium if Pencil MCP integration is attempted (a separate toolbox and posture expansion). Recommendation: Small scope now, Pencil as future work.

---

## Proposal 6: Character Names — A Shortlist

### Evidence

The existing roster names follow a pattern: real human names, gender-mixed, period-appropriate but not archaic. They feel like people you'd meet in a well-run workshop, not fantasy NPCs.

| Name | Title | Feel |
|------|-------|------|
| Dalton | Guild Artificer | Sturdy, reliable, craftsman |
| Verity | Guild Pathfinder | Truth-seeking, adventurous |
| Thorne | Guild Warden | Protective, thorough |
| Sable | Guild Sentinel | Dark, watchful, precise |
| Octavia | Guild Chronicler | Classical, literate, formal |
| Edmund | Guild Steward | Traditional, measured, household |
| Celeste | Guild Visionary | Elevated, forward-looking, sky |

The Guild Illuminator name evokes manuscript illumination. The character should be someone who works with light, color, and composition. The name should feel like it belongs in the same guild as the others: grounded, not flowery.

### Shortlist

**1. Lyra** — From the lyre (instrument) and the constellation. Suggests harmony, composition, and elevated craft. Gender: feminine. Resonance: artistic without being precious. The constellation connection plays well with Celeste (sky/stars); the lyre connection plays well with the guild's craftsperson aesthetic. Risk: might feel too musical for a visual role, though the composition resonance bridges the gap.

**2. Sienna** — A pigment color (burnt sienna), literally derived from earth. Suggests warmth, materiality, and the physical medium of visual art. Gender: feminine. Resonance: grounded in the actual materials of visual craft, the same way Dalton's name feels like someone who works with their hands. The color association is immediate and memorable. Risk: the association is so literal it might feel on-the-nose.

**3. Rune** — Marks that carry meaning. Suggests inscription, symbol, and visual communication at its most fundamental. Gender: neutral. Resonance: bridges text and image naturally (runes are both written and visual). Has the right weight for a craftsperson who understands that visual choices carry meaning. Fits the guild's slightly medieval register. Risk: might read as too mystical or fantasy-coded compared to the rest of the roster.

**4. Calder** — After Alexander Calder (sculptor/artist) or the Scots word for "hard water" (a river name). Suggests someone who shapes form. Gender: masculine. Resonance: artistic heritage without being precious about it. The hard consonants match the craftsperson register (Dalton, Thorne, Edmund). Risk: the Calder art reference is known but not universal; without it, the name is just a solid Scottish name, which works fine.

**5. Maren** — From the Latin "mare" (sea), or a Scandinavian name meaning "star of the sea." Suggests depth, reflection, and the play of light on water. Gender: feminine. Resonance: calm, deliberate, someone who sees clearly. The light-on-water metaphor works for a visual specialist who understands how light and color interact. Fits the guild's grounded-but-evocative register. Risk: the sea association is tangential to visual craft; needs the soul.md to bridge the gap.

### Recommendation

**Sienna.** The pigment connection is not accidental. An illuminator who is literally named after an earth pigment signals that this worker's craft is visual, material, and grounded in the physical reality of color. It's the same kind of naming logic as Verity (truth) for a researcher or Celeste (sky) for a visionary. The name does work before the soul.md is even read.

Calder is the strongest runner-up if the user prefers a masculine name or wants the artistic heritage reference.

---

## Filed Observations

**The toolbox is further along than the worker.** The `guild-hall-replicate` package already has a client, model registry, output handling, and tool implementations (`packages/guild-hall-replicate/index.ts`, `replicate-client.ts`, `model-registry.ts`, `output.ts`). The worker package is the missing half of a complete visual media domain. This is unusual: most roster workers were built before their domain toolboxes. The Illuminator can be built on top of working infrastructure, which de-risks the creative-direction challenge.

**Cost visibility is a posture concern, not a toolbox concern.** The Replicate brainstorm includes cost estimates in every tool response. The Illuminator's posture should encode cost-awareness as a quality standard: prefer cheap models for exploration (FLUX Schnell at $0.003/image), escalate to expensive models only for final output (FLUX Pro at $0.04/image). This is creative judgment, not a toolbox feature.

**The music-engine-rowan precedent.** The existing `art-gen-mcp` integration is used by music-engine's cover art and hook art agents. Those agents demonstrate the workflow pattern (prompt generation via verbalized sampling, multi-candidate selection, generation, optional editing). The Illuminator should learn from this pattern without depending on the music engine. The Replicate toolbox replaces `art-gen-mcp` for Guild Hall workers; the music engine keeps its own MCP server for its own workflow.
