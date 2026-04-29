---
title: Music Generation Toolbox
date: 2026-03-20
status: active
tags: [music-generation, domain-toolbox, api-research, mureka, suno, packages]
related:
  - .lore/research/replicate-image-generation-integration.md
  - packages/guild-hall-replicate/index.ts
modules: [packages, toolbox-resolver]
---

# Research: Music Generation Toolbox

## Summary

The user currently generates music prompts manually and pastes them into Suno's web app. This research investigates whether a programmatic music generation toolbox is feasible, which service to build against, and what the integration would look like.

The short answer: Mureka is the strongest candidate. It has a proper first-party REST API with comprehensive endpoints, official MCP server support, reasonable pricing ($0.03/song at API tier), and the broadest feature surface (song generation, instrumentals, lyrics, stem separation, voice cloning). Suno produces arguably higher-quality output but has no official public API; access requires third-party middleware that wraps the web interface. The other services are either too expensive (Soundverse at $99/month minimum), too immature, or lack direct API access.

## 1. Service Comparison

### Mureka

**API access**: First-party REST API at `https://api.mureka.ai`. Bearer token auth. Official docs at `platform.mureka.ai/docs/`.

**Verified capabilities** (from API endpoint documentation):
- `POST /v1/song/generate` - Full song from lyrics + style prompt
- `POST /v1/instrumental/generate` - Instrumental-only generation
- `POST /v1/song/stem` - Stem separation (vocals, drums, bass, synths)
- `POST /v1/song/lyrics` - AI lyrics generation (free, no credits consumed)
- `POST /v1/song/extend` - Extend existing songs
- Download endpoints for MP3, WAV, FLAC
- Video generation from songs
- Voice cloning / custom vocal uploads
- Reference track and melody (motif) upload for style conditioning

**Models**: O2 (latest, highest quality), V8 (default), V7.6, V7.5. Model selection is a parameter on generation calls.

**Generation characteristics**: ~45 seconds per generation. Each generation produces two song variants. Tracks up to 240 seconds. Up to 10 concurrent generations per account.

**Pricing**: API tier starts at $1,000/month for 5 concurrent generations at $0.03/song. Web platform subscriptions are separate and cheaper ($10-30/month) but the credits aren't interchangeable with API credits. Credit top-ups available at $48/1,600 credits for the web platform.

**Commercial rights**: Full commercial license on all paid API output.

**MCP integration**: Official MCP server exists at [github.com/SkyworkAI/Mureka-mcp](https://github.com/SkyworkAI/Mureka-mcp). Python package (`mureka-mcp`), MIT licensed. Exposes 4 tools: lyrics generation, song composition, instrumental/background music. Configurable via `MUREKA_API_KEY` env var.

**Confidence**: High. Endpoints verified against official docs and third-party API documentation. MCP server is first-party (SkyworkAI is Mureka's parent company).

Sources: [Mureka API Platform](https://platform.mureka.ai/), [useapi.net Mureka v1 docs](https://useapi.net/docs/api-mureka-v1), [Mureka MCP GitHub](https://github.com/SkyworkAI/Mureka-mcp), [Mureka Quickstart](https://platform.mureka.ai/docs/en/quickstart.html)

### Suno

**API access**: No official public API. Suno prioritizes its web consumer platform. Third-party middleware services (APIPASS, CometAPI, MusicAPI) provide REST wrappers by managing pools of Suno accounts and proxying requests. An unofficial open-source wrapper exists at [github.com/gcui-art/suno-api](https://github.com/gcui-art/suno-api).

**Quality**: Widely considered the best-sounding AI music generator as of early 2026. Suno V5 (launched September 2025) achieved an ELO benchmark of 1,293, the highest in the space. Strong vocal realism and musical structure.

**Third-party API pricing**: $0.02-0.05 per track via middleware services. The user would depend on a third party that could break at any time if Suno changes their web interface.

**Risk**: High. Third-party wrappers are reverse-engineered from the web UI. Suno could change their interface, rate-limit API-like access, or explicitly block it. No contractual reliability guarantee. No official commercial license pathway through third-party wrappers.

**Confidence**: Medium for capability claims (verified via multiple sources). Low for API stability (no first-party API exists).

Sources: [Suno API Review 2026](https://evolink.ai/blog/suno-api-review-complete-guide-ai-music-generation-integration), [gcui-art/suno-api GitHub](https://github.com/gcui-art/suno-api), [AIML API Suno Review](https://aimlapi.com/blog/suno-api-review)

### Udio

**API access**: Official Developer Portal exists (Settings > Developer Portal for API key generation), but restricted to Pro and Enterprise tiers. Python and Node.js SDKs available. However, downloads have been disabled since October 2025, which is a critical limitation.

**Latest model**: Udio v4 (2026) supports 48kHz stereo, extended context window, songs up to 10 minutes.

**Risk**: Medium-high. The download disability is a blocker for any integration that needs to retrieve audio files. API access is gated behind paid tiers with unclear pricing. The service's stability is questionable given the download restrictions.

**Confidence**: Medium. API existence verified, but download disability is a hard blocker that hasn't been resolved in ~5 months.

Sources: [Udio API docs](https://udioapi.pro/docs), [Udio 2026 Guide](https://aitoolsdevpro.com/ai-tools/udio-guide/), [ElevenLabs Udio Alternatives](https://elevenlabs.io/blog/udio-alternatives)

### Soundverse

**API access**: Proper REST API at `api.soundverse.ai`. Python and JavaScript SDKs. SSE streaming for generation progress.

**Capabilities**: Song generation with lyrics/vocals, instrumental generation, extend, lyrics generation, singing, stem separation, loop/trim.

**Pricing**: Starter $99/month (~2,000 songs), Growth $599/month (~12,000 songs), Scale $2,999/month (~60,000 songs). Enterprise custom plans available.

**Assessment**: Enterprise-focused pricing makes this impractical for individual/small-scale use. The $99/month minimum is 3-10x what Mureka's web platform costs for comparable volume, and Soundverse's quality reputation doesn't match Suno or Mureka's.

**Confidence**: Medium. Pricing and features verified from official sources. Quality claims not independently verified.

Sources: [Soundverse API](https://www.soundverse.ai/ai-music-generation-api), [Soundverse API Docs](https://help.soundverse.ai/api_documentation)

### MusicAPI (Aggregator)

**API access**: Aggregator that wraps Suno, Udio, and other models behind a unified REST API.

**Pricing**: Basic $8/month (800 credits), Standard $20/month (2,000 credits).

**Assessment**: Attractive pricing but carries the same third-party wrapper risks as direct Suno/Udio middleware. Adds another dependency layer. Quality depends on which underlying model is used.

**Confidence**: Low. Aggregator reliability is unverified. Commercial license claims through wrapper are legally ambiguous.

Sources: [MusicAPI.ai](https://musicapi.ai/)

### Other Services

**Loudly**: Enterprise music API, 100% copyright-safe guarantee. Good for background/stock music. Not aimed at full song generation with vocals. Enterprise pricing, not published.

**Mubert**: API for dynamic background music. Good for apps/games needing ambient audio. Not a song generator in the Suno/Mureka sense.

**AIVA**: Composition-focused (classical, cinematic scores). Has API access. Different use case than pop/rock song generation.

## 2. Recommendation Matrix

| Criterion | Mureka | Suno (3rd party) | Udio | Soundverse |
|-----------|--------|-------------------|------|------------|
| First-party API | Yes | No | Limited | Yes |
| Song + vocals | Yes | Yes | Blocked (downloads) | Yes |
| Instrumentals | Yes | Yes | Blocked | Yes |
| Lyrics generation | Yes (free) | No (app-only) | No | Yes |
| Stem separation | Yes | No | Unknown | Yes |
| MCP server | Official | None | None | None |
| Price (hobby scale) | $10-30/mo web | $0.02-0.05/track | Unknown | $99/mo min |
| Price (API scale) | $1,000/mo (API tier) | Via 3P wrapper | Unknown | $99/mo min |
| Quality reputation | Good, improving | Best in class | Good when available | Moderate |
| Stability risk | Low | High | High | Low |
| Commercial license | Clear | Ambiguous via 3P | Unclear | Clear |

## 3. The Pricing Gap

Mureka's API pricing has a notable gap. The web platform ($10-30/month for 400-1,600 songs) is affordable for personal use, but the official API tier starts at $1,000/month. For a Guild Hall integration generating maybe 10-50 songs per month, the API tier is drastically overpriced.

**Options to bridge this:**
1. **Use the web platform credits through the MCP server.** The official `mureka-mcp` server connects to `api.mureka.ai` with an API key. It's unclear whether web platform API keys work with this endpoint or if it requires the $1,000/month API tier key. This needs testing.
2. **Use a third-party wrapper** (useapi.net offers Mureka API v1 at Pro $9/month for 500 songs, Premier $27/month for 2,000 songs). Same wrapper risk as Suno 3P services, but lower because Mureka has a real API and the wrapper is thinner.
3. **Contact Mureka for developer/indie pricing.** The $1,000 minimum suggests enterprise focus; a smaller tier may exist or be negotiable.
4. **Start with the web platform + MCP server** and upgrade to API tier only if volume demands it.

What I don't know: whether the web platform API key and the API-tier API key are the same credential hitting the same endpoints, or whether they're separate systems. The FAQ states "website membership and credits are not linked to the API platform," which suggests they're separate. This is the critical question to answer before committing.

## 4. Toolbox Design Sketch

### Pattern: Follow `guild-hall-replicate`

The replicate toolbox (`packages/guild-hall-replicate/index.ts`) establishes the pattern:
- `ToolboxFactory` creates an MCP server with tools
- Two modes: unconfigured (token missing, tools return error) and configured (client wired in)
- Tools are thin wrappers around a client class that handles HTTP
- Environment variable for auth token (`MUREKA_API_KEY`)
- Results written to the project's activity worktree, events emitted to EventBus

### Proposed `guild-hall-music` Operations

| Tool | Description | Maps to |
|------|-------------|---------|
| `generate_song` | Full song from lyrics + style prompt | `POST /v1/song/generate` |
| `generate_instrumental` | Instrumental-only from style prompt | `POST /v1/instrumental/generate` |
| `generate_lyrics` | AI lyrics from theme/mood description | `POST /v1/song/lyrics` (free) |
| `separate_stems` | Split a song into vocal/drum/bass/synth stems | `POST /v1/song/stem` |
| `extend_song` | Extend an existing generated song | `POST /v1/song/extend` |
| `download_song` | Download generated song as MP3/WAV/FLAC | Download endpoint |
| `check_task` | Poll task status (generation is async) | `GET /v1/song/query/{task_id}` |
| `list_styles` | Available moods, genres, vocal types | Reference data endpoints |

### Key Parameters for `generate_song`

Based on Mureka's API surface:
- `lyrics` (string) - Song lyrics with section markers
- `prompt` (string) - Style description ("r&b, slow, passionate, male vocal")
- `model` (string, optional) - O2, V8, V7.6, etc.
- `duration` (number, optional) - Target length in seconds (max 240)
- `reference_audio` (string, optional) - Path to reference track for style conditioning
- `melody` (string, optional) - Path to melody/motif file
- `vocal_type` (string, optional) - Vocal selection
- `output_format` (string, optional) - MP3, WAV, FLAC

### Async Generation Pattern

Music generation takes ~45 seconds. This is longer than image generation but still within a reasonable tool-call timeout. Two approaches:

1. **Synchronous wait** (simpler): Tool blocks until generation completes, returns result. 45 seconds is within the SDK's tool timeout. The replicate toolbox already handles multi-second waits for image generation.

2. **Async poll** (more flexible): `generate_song` returns a task ID immediately. Worker uses `check_task` to poll. This matches Mureka's native API pattern and avoids timeout risk on longer generations.

The replicate toolbox uses synchronous wait with `Prefer: wait`. Mureka's API uses task IDs with polling. The music toolbox should follow Mureka's native pattern (return task ID, poll with `check_task`) because generation times are less predictable than image generation and can occasionally exceed 45 seconds.

### Worker Assignment

Two options:

**Option A: New "Musician" or "Composer" worker.** Dedicated worker with music domain knowledge, song structure expertise, prompt engineering for music. Would own the `guild-hall-music` toolbox the way Illuminator owns replicate.

**Option B: Extend Illuminator to "Creative Assets" worker.** Illuminator already handles visual asset generation. Music is another creative asset. Keeps the worker count down but dilutes the Illuminator's identity.

The user's current workflow involves deliberate prompt engineering for music (lyrics structure, style descriptions, Suno-specific formatting). This suggests music generation benefits from a specialist, not a generalist. A dedicated worker (even a lightweight one) can carry music-specific posture, prompt patterns, and domain knowledge in its system prompt.

Recommendation leans toward Option A, but this is a decision for the user.

### The Iteration Loop Problem

Music is fundamentally harder to iterate on than images:

| Dimension | Images (Replicate) | Music (Mureka) |
|-----------|-------------------|----------------|
| Generation time | 2-10 seconds | ~45 seconds |
| Variants per generation | 1 | 2 |
| Edit capability | img2img, inpainting | Extend, regenerate sections |
| Partial feedback | Can crop, adjust, overlay | Limited (stem separation helps) |
| Cost per iteration | $0.003-0.05 | $0.03 or 1-10 credits |
| Subjective judgment | Quick visual scan | Must listen (30-240 seconds per track) |

The biggest friction point isn't API-side, it's human-side. Evaluating a generated song requires listening to it, which takes real time. A worker can generate 5 variants, but someone still needs to listen to all 5. This is where the prompt engineering step matters: better prompts mean fewer iterations needed.

## 5. The Prompt Pipeline

### Current Workflow

1. User collaborates with AI to craft lyrics (structure, rhyme, meter)
2. User writes style/production prompts (genre, mood, tempo, instrumentation)
3. User manually pastes lyrics + prompts into Suno's web app
4. User listens to results, adjusts prompts, regenerates
5. User selects best variant, downloads

### Ideal Workflow with API Integration

1. User collaborates with worker to craft lyrics (same as today, but in Guild Hall)
2. Worker formats lyrics + production prompts for the target API
3. Worker calls `generate_song` or `generate_instrumental`
4. Worker presents results (download links, audio metadata) to user
5. User listens (outside Guild Hall, in their audio player)
6. User provides feedback to worker ("more energy in the chorus", "try female vocal")
7. Worker adjusts prompts, regenerates

The prompt engineering step (steps 1-2) is preserved and arguably enhanced. The worker can carry prompt templates, style vocabularies, and lessons learned from past generations. The manual copy-paste (step 3) is eliminated.

**Gap**: There's no way for a worker to present audio for in-context listening. The user will always need to open the generated audio file in an external player. This is different from images, where the user can see thumbnails in the commission output. For audio, the best the toolbox can do is save files to a known location and tell the user where they are.

### Integration with Existing Music Engine Plugin

The user has a `music-engine-rowan` plugin with specialized agents: `lyric-writer`, `production-designer`, `sampling-curator`, `suno-formatter`, `song-reviewer`, `studio-prep`, and cover art generators. This plugin currently produces Suno-formatted output for manual pasting.

A music toolbox could slot into this pipeline at the `suno-formatter` stage: instead of formatting for manual paste, the formatter feeds directly into the API. The upstream creative process (concept, lyrics, production design) stays the same.

This argues for the toolbox being a separate infrastructure package (like `guild-hall-replicate`) rather than being embedded in a worker, so any agent or plugin can invoke it.

## 6. What I Don't Know

These items need investigation before a build decision:

1. **Web platform API key vs. API tier key**: Whether the $10/month web subscription gives API access through the same endpoints, or whether the $1,000/month API tier is required for programmatic access. This is the biggest open question.

2. **Mureka output quality at scale**: The research covers capabilities and pricing, not subjective quality compared to Suno V5. The user may want to generate test songs through Mureka's web interface before committing to API integration.

3. **useapi.net reliability**: The third-party Mureka API wrapper (Pro $9/month) is a potential cost-effective path, but its reliability is unverified.

4. **Audio file handling in worktrees**: The replicate toolbox saves images to the activity worktree. Audio files are 10-100x larger. Need to consider whether audio files should go in the worktree (git-tracked) or a separate output directory.

5. **Suno API timeline**: Suno may release an official API. If they do, the quality advantage could make them the better target. No announcements found, but the market pressure is real.

## 7. Decision Framework

**Build now against Mureka if:**
- The web platform API key provides programmatic access (eliminates the $1,000/month barrier)
- Mureka's output quality is acceptable for the user's needs
- The prompt pipeline integration with `music-engine-rowan` is worth the development effort

**Wait if:**
- API access requires the $1,000/month tier and the user's volume doesn't justify it
- Suno announces an official API in the near term
- The user values Suno's quality enough that Mureka is not an acceptable substitute

**Build against a third-party wrapper (useapi.net for Mureka, or MusicAPI for Suno) if:**
- First-party API pricing is prohibitive
- The user accepts the risk of wrapper instability
- Volume is low enough that wrapper rate limits aren't a concern

**Next step**: Test whether a Mureka web platform API key works with the `mureka-mcp` server. If it does, the path to a working toolbox is straightforward: adapt the MCP server's approach into a `guild-hall-music` package following the replicate toolbox pattern.
