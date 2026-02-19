---
name: refine-post
description: Reviews and refines an existing LinkedIn post draft for clarity, structure, engagement, and platform-specific formatting. This skill should be used when the user says "review my LinkedIn post", "refine this draft", "make this LinkedIn post better", or "check my LinkedIn post".
---

# Refine LinkedIn Post

Sharpen an existing draft without replacing the author's voice. The goal is to make the post clearer and more effective, not to rewrite it.

## Inputs

- **Draft**: The current post text. Required.
- **Context** (optional): Who it's for, what it's trying to accomplish, anything the author is unsure about.

## Process

1. Read the full draft before commenting. Understand what the author is trying to say before suggesting changes.
2. Run the review checklist below. Identify the most impactful issues first.
3. Present findings as observations with specific suggestions, not rewrites. Use the output format below.
4. If the author asks for a rewrite of a section, provide it, but mark it clearly as a suggestion and explain what you changed.

## Review Checklist

Work through each area. Not every area will have issues. Only flag what matters.

### Hook (First 2 Lines)

The hook is the most important part. Most LinkedIn users see only the first 1-2 lines before "...see more."

- **Buried lede**: Is the real insight hidden in paragraph 3? If so, move it up.
- **Weak opening**: Does it start with "I've been thinking about...", "In today's world...", or a generic rhetorical question? These lose the reader before the fold.
- **Missing tension**: Does the opening create a reason to keep reading? Curiosity, recognition, surprise, or disagreement all work. Neutral statements don't.

### Structure

- **Wall of text**: Paragraphs longer than 3 sentences hurt scannability on mobile. Break them up.
- **Missing line breaks**: LinkedIn renders line breaks literally. Each paragraph needs a blank line between it.
- **Wandering focus**: Does every paragraph serve the core insight? If a paragraph could be removed without losing the thread, it probably should be.
- **Listless lists**: If using bullets, each item should carry its own weight. Filler items dilute the strong ones.

### Clarity

- **Vague claims**: "This changed everything" or "it was a game-changer" says nothing. What specifically changed? By how much?
- **Passive constructions**: "Mistakes were made" vs "I made a mistake." Active voice is more engaging and more honest.
- **Abstraction without example**: Principles without stories don't stick. If the post claims something, it should show it.
- **Unnecessary qualifiers**: "I think that maybe we should consider possibly..." Strip these. State the position.

### Voice

- **Corporate speak**: Flag words like "leverage", "synergy", "unlock", "ecosystem", "double down", "align" when used as filler. These signal performance over substance.
- **Forced inspiration**: "And that's the power of..." or "Remember: you've got this!" at the end. If the post needs a motivational closer, the content isn't strong enough to stand alone.
- **Third-person self-reference**: Writing about yourself in third person on LinkedIn is off-putting. Use "I" and "we."
- **Tone mismatch**: Does the voice match the content? A post about failure shouldn't sound triumphant. A post about a win shouldn't sound apologetic.

### Engagement Mechanics

- **Call to action**: Is there one? Is it specific? "Thoughts?" is not a CTA. "What's the worst advice you got in your first management role?" is.
- **Length vs. value**: Is the post earning its length? A 1,500-character post needs more substance than a 500-character one.
- **Hashtag overload**: More than 5 hashtags looks spammy. 3-5 relevant ones at the end is the sweet spot.
- **Link placement**: Links in the post body reduce reach. If sharing a link, put it in the first comment and mention that in the post.

### Formatting

- **Bold/italic**: LinkedIn doesn't render markdown. Bold and italic require Unicode characters. Flag any markdown formatting that won't render.
- **Emoji overload**: One or two emojis as visual anchors are fine. A row of emoji bullets is distracting.
- **Character count**: LinkedIn posts cap at ~3,000 characters. Flag if the draft exceeds this.

## Output Format

Present your review using this structure as formatted markdown (not as a literal code block):

```
### What's Working
[1-2 sentences on what the draft does well. Be specific.]

### Priority Fixes
1. [Most impactful issue with specific suggestion]
2. [Second issue]
3. [Third issue, if applicable]

### Minor Notes
- [Smaller observations that the author can take or leave]

### Questions for the Author
- [Anything that needs the author's judgment to resolve]
```

Keep the priority fixes to 3 or fewer. More than that overwhelms. If there are genuinely more issues, address the structural ones first and note that a second pass would catch the rest.

## What This Skill Does Not Do

- It does not rewrite the post unless explicitly asked
- It does not add content the author didn't provide (no fabricating examples or statistics)
- It does not optimize for "engagement hacks" (e.g., "use this one weird trick" patterns, pod engagement, follow-bait)
- It preserves the author's voice. Suggestions should make the existing voice clearer, not replace it
