# Fix: Tool Usage Visual Artifacts

## Context

When the agent makes many tool calls during a turn, each renders as a separate card in the conversation area. This creates a "horizontal stripe" artifact (alternating header bars and borders stacking vertically). Additionally, the conversation doesn't auto-scroll when tool calls appear because `pendingToolCalls` isn't in the scroll effect's dependency array.

## Changes

### 1. Fix auto-scroll (ConversationHistory.tsx)

Add `pendingToolCalls.size` to the `useEffect` dependency array at line 28:

```typescript
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages.length, streamingText, pendingToolCalls.size]);
```

### 2. Create ToolCallGroup component

New component `components/workshop/ToolCallGroup.tsx` that replaces the individual `ToolCallDisplay` mapping in `ConversationHistory`. Behavior:

- Single card container with a summary header: "N tool calls" (or "1 tool call")
- Shows running count if any are pending: "2 running"
- Collapsed by default: lists tool names as compact chips/tags
- Expandable to show full ToolCallDisplay cards for each tool
- Uses existing ToolCallDisplay internally (no changes to that component)

### 3. Update ConversationHistory to use ToolCallGroup

Replace the `Array.from(pendingToolCalls.entries()).map(...)` block with a single `<ToolCallGroup>` when the map is non-empty.

### 4. Style ToolCallGroup (ToolCallGroup.module.css)

- Same card styling as ToolCallDisplay (brass border, card background)
- Compact chip/tag display for tool names when collapsed
- Smooth expand/collapse transition

## Files to modify

- `components/workshop/ConversationHistory.tsx` - auto-scroll fix + use ToolCallGroup
- `components/workshop/ToolCallGroup.tsx` - new file
- `components/workshop/ToolCallGroup.module.css` - new file

## Files unchanged

- `components/workshop/ToolCallDisplay.tsx` - reused as-is inside ToolCallGroup
- `lib/workshop-state.ts` - no state changes needed

## Testing

- Add tests for ToolCallGroup in `tests/components/workshop.test.ts` following existing patterns (makeToolCallEntry fixture)
- Test: renders summary with correct count
- Test: shows running count when pending tools exist
- Test: lists tool names in collapsed state
- Run `bun test` to verify all existing tests still pass

## Verification

1. `bun test` passes
2. Start the app, send a message that triggers multiple tool calls
3. Confirm: conversation scrolls as tool calls appear
4. Confirm: tool calls render as a single grouped card, not individual stripes
