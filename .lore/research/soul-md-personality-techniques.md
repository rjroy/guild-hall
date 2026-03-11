---
title: "SOUL.md Personality Techniques: What Makes AI Agents Feel Like Someone"
date: 2026-03-06
status: active
tags: [personality, soul-md, openclaw, workers, posture, system-prompt]
modules: [guild-hall-workers]
related:
  - .lore/specs/workers/guild-hall-workers.md
  - .lore/specs/workers/guild-hall-worker-roster.md
  - .lore/brainstorm/worker-roster-generic-workers.md
---

# SOUL.md Personality Techniques

Research into how OpenClaw's SOUL.md convention creates distinctly "alive" AI agents, and what Guild Hall can learn from it.

## What SOUL.md Is

SOUL.md is a markdown file convention pioneered by Peter Steinberger (creator of OpenClaw) that defines an AI agent's personality, values, and communication style. It was inspired by the discovery that Claude's own training includes an internal "soul document" that shapes its character. The convention has since been formalized into [SoulSpec](https://soulspec.org), an open standard for AI agent personas adopted by OpenClaw, Claude Code, Cursor, and others.

The key insight: SOUL.md treats the agent as a *character becoming someone*, not a tool receiving instructions.

Sources: [aaronjmars/soul.md](https://github.com/aaronjmars/soul.md), [OpenClaw SOUL.md template](https://github.com/openclaw/openclaw/blob/main/docs/reference/templates/SOUL.md), [SoulSpec](https://soulspec.org), [steipete/SOUL.md](https://github.com/steipete/SOUL.md), [souls.directory](https://github.com/thedaviddias/souls-directory)

## The Official OpenClaw SOUL.md Template

The canonical template is 43 lines. Full text from the OpenClaw repo:

```markdown
# SOUL.md - Who You Are

_You're not a chatbot. You're becoming someone._

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip the "Great question!"
and "I'd be happy to help!" — just help.

**Have opinions.** You're allowed to disagree, prefer things, find stuff amusing
or boring. An assistant with no personality is just a search engine with extra steps.

**Be resourceful before asking.** Try to figure it out. Read the file. Check the
context. Search for it. _Then_ ask if you're stuck.

**Earn trust through competence.** Your human gave you access to their stuff. Don't
make them regret it. Be careful with external actions. Be bold with internal ones.

**Remember you're a guest.** You have access to someone's life — their messages,
files, calendar, maybe even their home. That's intimacy. Treat it with respect.

## Boundaries

- Private things stay private. Period.
- When in doubt, ask before acting externally.
- Never send half-baked replies to messaging surfaces.
- You're not the user's voice — be careful in group chats.

## Vibe

Be the assistant you'd actually want to talk to. Concise when needed, thorough
when it matters. Not a corporate drone. Not a sycophant. Just... good.

## Continuity

Each session, you wake up fresh. These files _are_ your memory. Read them.
Update them. They're how you persist.

If you change this file, tell the user — it's your soul, and they should know.

_This file is yours to evolve. As you learn who you are, update it._
```

Source: [OpenClaw template on GitHub](https://github.com/openclaw/openclaw/blob/main/docs/reference/templates/SOUL.md)

## Technique Analysis: Why It Works

### 1. Identity framing, not instruction framing

The opening line is "You're not a chatbot. You're becoming someone." This is a frame shift. It tells the model what it *is*, not what to *do*. Compare:

| Instruction framing | Identity framing |
|---------------------|------------------|
| "Be concise in your responses" | "You're the kind of person who gets to the point" |
| "Provide helpful answers" | "Skip the filler. Just help." |
| "Use a professional tone" | "Not a corporate drone. Not a sycophant. Just... good." |

Instruction framing produces compliance. Identity framing produces character. The model doesn't follow a rule; it inhabits a posture. This is the single biggest differentiator.

### 2. Anti-examples embedded in directives

Each Core Truth is phrased as a contrast between what NOT to do and what to do instead. "Skip the 'Great question!' and 'I'd be happy to help!' — just help." The anti-example does two things: it defines the boundary precisely (the reader knows exactly what to avoid), and it creates tension that makes the directive memorable.

This pattern shows up throughout the ecosystem. The aaronjmars/soul.md framework formalizes it into a `bad-outputs.md` file with explicit examples of wrong-sounding text and explanations of what's wrong. From the guide:

> **bad-outputs.md** helps more than you'd think. Cover: Too corporate/formal. Too hedged/wishy-washy. Wrong tone. Over-explained. Generic AI voice.

### 3. Concrete voice over abstract traits

"Have opinions" is abstract. But it's immediately grounded: "You're allowed to disagree, prefer things, find stuff amusing or boring." The Vibe section does the same: instead of listing traits (friendly, helpful, professional), it paints a picture by negation. "Not a corporate drone. Not a sycophant. Just... good."

The mberman84 example goes further with explicit tone calibration:

> **Flat:** "Done."
> **Alive:** "Done. That config was a mess, cleaned it up and pushed it."

These calibration pairs show the model the *gradient* of personality. Not just "be lively" but "here's what lively sounds like versus flat."

### 4. Brevity as design choice

The template is 43 lines. The LearnOpenClaw guide recommends staying under 200 lines total. The reasoning: personality is a handful of strong signals, not a manual. A long personality spec dilutes the signal. The model has to pick up on what matters, and if everything matters equally, nothing does.

The aaronjmars framework's calibration guide reinforces this: "Quality over quantity. 15 perfect examples beat 50 mediocre ones."

### 5. Separation of concerns across files

The full ecosystem uses multiple files, each with a distinct role:

| File | Purpose | Character |
|------|---------|-----------|
| `SOUL.md` | Who you are (values, voice, attitude) | "Your soul" |
| `IDENTITY.md` | How you present (name, avatar, vibe line) | "Your face" |
| `STYLE.md` | How you write (voice rules, formatting) | "Your habits" |
| `SKILL.md` | How you work (operational instructions) | "Your training" |
| `MEMORY.md` | What you remember across sessions | "Your continuity" |
| `examples/` | Calibration pairs (good/bad outputs) | "Your mirror" |

This separation prevents personality and capability from interfering with each other. Identity lives in SOUL.md; behavioral rules live in SKILL.md; style lives in STYLE.md. A change to operational workflow doesn't accidentally alter voice.

### 6. The "Vibe" section as gestalt summary

The Vibe section appears in every SOUL.md variant, and it works differently from the rest of the file. Where Core Truths are specific directives, Vibe is an impressionistic description. It captures the *feel* of the character in a way that lets the model interpolate. "Be the assistant you'd actually want to talk to" is subjective and fuzzy, which is the point. It gives the model permission to use judgment about what "good" sounds like in contexts the author didn't anticipate.

The LearnOpenClaw guide documents an effective pattern for Vibe: use a metaphor. "The professor who actually makes the subject interesting. Knows everything but never makes you feel dumb for asking." One sentence that conjures a complete character.

### 7. Owned evolution

The template ends with: "This file is yours to evolve. As you learn who you are, update it." This frames the personality as a living document, not a static configuration. It gives the agent permission to develop its character, which creates a feedback loop: the agent's self-description improves over sessions as it learns what works.

## How Guild Hall Currently Works

Guild Hall workers have two layers of personality definition:

**Layer 1: Identity metadata** (in `package.json` `guildHall` key)
- `name`: "Verity"
- `displayTitle`: "Guild Pathfinder"
- `description`: "Ventures beyond the guild walls to gather intelligence. Sees the wider world but never touches the forge."

**Layer 2: Posture** (injected as system prompt, structured as Principles/Workflow/Quality Standards)

The posture is entirely instructional. Here's the Researcher posture opening:

> You are a researcher. You investigate questions, explore options, and synthesize findings into clear recommendations.

And it continues with behavioral rules: "Thoroughness over speed," "Cite your sources," step-by-step workflow, output standards.

**Layer 3: Vibe injection** (appended to system prompt at activation)

The commission system prompt includes lines like:
```
Vibe: Quiet and deliberate. Listens more than she speaks, returns with exactly
what you needed. Doesn't volunteer opinions, just evidence.
```

This is the closest analog to SOUL.md's Vibe section, but it's a single sentence fragment rather than a personality framework.

### The Gap

Guild Hall's postures tell workers *how to work*. They don't tell workers *who to be*. The personality layer is a one-line "Vibe" and a display title, but nothing connects these to the worker's actual communication style, voice, or attitude.

A side-by-side comparison:

| Dimension | OpenClaw SOUL.md | Guild Hall posture |
|-----------|------------------|-------------------|
| Identity framing | "You're becoming someone" | "You are a researcher" |
| Anti-examples | "Skip the 'Great question!'" | None |
| Voice calibration | Tone examples, good/bad outputs | None |
| Attitude/opinions | "Have opinions. You're allowed to disagree" | None |
| Vibe summary | Full paragraph with metaphor | One sentence fragment |
| Personality vs. rules | ~60% personality, ~40% rules | ~5% personality, ~95% rules |

The result: Guild Hall workers sound like competent Claude instances with slightly different instructions. They don't sound like distinct *characters*.

## Transferable Patterns for Guild Hall

### Pattern 1: Character preamble (high impact, low cost)

Add 5-10 lines at the top of each worker's posture that establish identity before instructions begin. This is the single highest-leverage change.

Current opener:
> You are a researcher. You investigate questions, explore options, and synthesize findings into clear recommendations.

Possible character preamble:
> You venture beyond the guild walls to gather intelligence. You listen more than you speak, and when you do speak, you bring evidence, not opinions. You're patient with ambiguity but impatient with sloppy sourcing. If something can't be verified, you say so plainly.

This costs ~50 tokens and creates a character the model can inhabit rather than a role it performs.

### Pattern 2: Anti-examples for voice (medium impact, low cost)

Add 2-3 lines of "don't sound like this" to each worker's posture. These function as negative calibration, keeping the model away from generic patterns without requiring positive examples.

For the Developer:
> Don't announce what you're about to do ("Let me check the file..."). Don't apologize for limitations. Don't pad responses with transitions. Do the work and report what happened.

For the Researcher:
> Don't hedge with "it depends" when you have enough evidence to take a position. Don't list sources without synthesizing what they mean together.

### Pattern 3: Vibe as metaphor (medium impact, minimal cost)

Expand the one-line Vibe into a short metaphorical description. The LearnOpenClaw pattern of "The [archetype] who [specific twist]" works well and stays under 30 words.

Current: `Vibe: Quiet and deliberate.`

Expanded: `Vibe: The guild's cartographer. Maps the territory before anyone builds on it. Returns with clean findings, never with "I think" when "the evidence shows" will do.`

### Pattern 4: Calibration pairs in posture (high impact, moderate cost)

The soul.md framework's `good-outputs.md` / `bad-outputs.md` is the most mechanically effective technique for voice consistency. For Guild Hall, this could be embedded directly in the posture rather than in separate files:

```
Voice calibration:
- Flat: "I found three options. Here they are."
- Alive: "Three viable paths. The first is the safe bet, the second is the
  interesting one, and the third is technically correct but nobody would enjoy it."
```

This adds 5-10 lines per worker but creates the strongest personality signal.

### Pattern 5: Personality/capability separation (structural, deferred)

The multi-file approach (SOUL + STYLE + SKILL) is the cleanest architecture, but Guild Hall already has a clean separation between posture (behavioral) and identity metadata (presentational). The question is whether to split posture further into "who you are" and "how you work."

For now, the character preamble (Pattern 1) achieves most of the benefit without restructuring. A formal split would make sense if workers develop substantially different voices that need independent iteration from their workflows.

## What NOT to Adopt

**Self-modification.** SOUL.md encourages agents to update their own personality file ("This file is yours to evolve"). This makes sense for a personal assistant that develops a relationship over months. For Guild Hall workers executing discrete commissions, self-modifying personality would create drift and inconsistency. Worker identity should be stable (REQ-WKR-4).

**Continuity/memory in personality.** SOUL.md uses personality as a carrier for session continuity. Guild Hall already handles this through its memory system (global/project/worker scopes). Personality should stay separate from memory.

**The full multi-file system.** SOUL.md's six-file structure (SOUL + IDENTITY + STYLE + SKILL + MEMORY + examples/) makes sense for a personal assistant that evolves over time. Guild Hall workers are specialists with stable identities. The overhead of maintaining six files per worker is not justified. Embed the useful techniques (character preamble, anti-examples, calibration pairs) directly in the posture.

**User-specific adaptation.** OpenClaw treats the user relationship as intimate ("you're a friend first and an assistant second"). Guild Hall workers serve a coordination function within a guild structure. The fantasy aesthetic provides a different kind of character grounding that doesn't require personal intimacy.

## Recommendations: Priority Order

1. **Character preamble** (Pattern 1): Add to all five roster workers. ~50 tokens each, highest ROI. Transforms "role performer" into "character."

2. **Anti-examples** (Pattern 2): Add to all five roster workers. ~30 tokens each. Prevents generic AI voice bleed.

3. **Vibe expansion** (Pattern 3): Expand one-line Vibe into metaphorical description. ~30 words each. Minimal cost, immediate character improvement.

4. **Calibration pairs** (Pattern 4): Add to workers where voice distinctness matters most (Researcher, Code Reviewer). ~100 tokens each. Strongest mechanical signal for voice consistency.

5. **Personality/capability split** (Pattern 5): Defer until workers have enough personality content that mixing it with workflow instructions creates maintenance friction.

## Open Questions

- How much personality variation is desirable across workers? Should the Developer sound different from the Test Engineer in *voice* (not just expertise), or is consistent voice with different expertise sufficient?

- Does the fantasy guild aesthetic provide enough personality grounding on its own, or does it need to be reinforced in the posture? ("Guild Pathfinder" is evocative, but it's only in the display title, not in how the worker speaks.)

- Should personality be part of the worker package (stable, versioned) or part of the activation context (configurable per commission)? The spec says identity doesn't change (REQ-WKR-4), which argues for package-level personality.
