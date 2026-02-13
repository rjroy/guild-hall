/**
 * Pure utility functions extracted from Board components for testability.
 */

/** Formats a message count into a human-readable label with correct pluralization. */
export function formatMessageLabel(count: number): string {
  return count === 1 ? "1 message" : `${count} messages`;
}

/** Determines whether the create-session form is in a submittable state. */
export function canSubmitSession(
  name: string,
  selectedCount: number,
  creating: boolean,
): boolean {
  return name.trim().length > 0 && selectedCount > 0 && !creating;
}

/** Builds the JSON body for POST /api/sessions from form state. */
export function buildCreateSessionBody(
  name: string,
  selectedMembers: Set<string>,
) {
  return {
    name: name.trim(),
    guildMembers: Array.from(selectedMembers),
  };
}

/** Returns a new Set with the value toggled (added if absent, removed if present). */
export function toggleSetMember<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}
