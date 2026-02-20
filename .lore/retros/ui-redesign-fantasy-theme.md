---
title: "Next.js CSS property order matters for backdrop-filter"
status: complete
created: 2026-02-14
tags: [css, next.js, build-quirks, glassmorphism, visual-design]
modules: [components/workshop/MessageBubble]
---

# Retro: Guild Hall UI Redesign - Fantasy Theme

## Summary
Complete redesign of Guild Hall UI from modern minimalist to fantasy theme with medieval aesthetic, glassmorphic effects, and parchment-style cards. Achieved 100% spec compliance (54/54 requirements) across 15 implementation phases with all 398 tests passing throughout.

## What Went Well

**Systematic phase approach**: Breaking the implementation into 15 focused phases (colors, typography, cards, forms, etc.) made the large redesign manageable and allowed for incremental verification at each step.

**Code review effectiveness**: Running fresh-context code review after each phase caught 11 critical issues that would have accumulated technical debt (prop type mismatches, missing test coverage, accessibility gaps, performance concerns).

**Test stability**: All 398 existing tests remained passing throughout the redesign, confirming that visual changes didn't break functionality.

**Spec compliance**: Achieved 54/54 requirements met, including all core visual elements, typography, color palette, and glassmorphic effects.

**Glassmorphic implementation**: Successfully created the fantasy aesthetic using backdrop-filter blur effects on cards, dialogs, and chat bubbles for depth and visual interest.

## What Could Improve

**Earlier production build verification**: The missing backdrop-filter on agent chat bubbles wasn't caught until after completion because testing focused on dev mode. Visual effects that depend on CSS processing should be verified in production builds earlier.

**Understanding Next.js CSS compilation**: The property order quirk (vendor prefix must precede standard property or the standard one gets dropped) was unexpected and specific to MessageBubble.module.css. Other components in the same build worked with either order. This suggests gaps in understanding how Next.js processes different CSS modules.

**Visual regression testing**: Manual screenshot comparison caught the blur issue. Automated visual regression tests would catch these earlier, especially for glassmorphic effects that are subtle in code review.

## Lessons Learned

**Next.js CSS property order matters for backdrop-filter**: In MessageBubble.module.css specifically, placing the standard `backdrop-filter` property before `-webkit-backdrop-filter` caused Next.js to drop the standard property during compilation. The vendor-prefixed property must come first. This quirk doesn't affect all components (ConfirmDialog and SessionCard work with either order), suggesting file-specific processing behavior in Next.js CSS compilation.

**Testing methodology**: Controlled testing (swapping property order back and forth) proved the causation definitively. When debugging CSS compilation issues, direct examination of the compiled chunk plus controlled variation testing beats speculation.

**Comments prevent regression**: Added inline comment explaining the property order requirement. Build quirks that violate developer expectations need explicit documentation at the source location, not just in retros or knowledge bases.

**Code review catches integration gaps**: Fresh-context review consistently identified issues the implementer missed (missing exports, prop type errors, accessibility gaps). Running review after each phase prevents accumulation of technical debt.

**DRY vs clarity tradeoff**: Reviewer caught over-abstraction in color system (nested CSS variables that made the code harder to understand without providing real flexibility). Sometimes duplication is clearer than indirection.

## Artifacts
- Spec: `.lore/specs/phase-1/ui-redesign-fantasy-theme.md`
- Implementation notes: `.lore/notes/ui-redesign-fantasy-theme.md`
- Plan: `.lore/plans/ui-redesign-fantasy-theme.md`
- Key commit: ed18a39 (CSS property order fix with explanatory comment)
