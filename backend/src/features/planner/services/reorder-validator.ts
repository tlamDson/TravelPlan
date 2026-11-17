export type ReorderValidation = { ok: true } | { ok: false; message: string };

/**
 * A reorder must be an exact permutation of the day's current activity ids:
 * same length, every id unique, every id present. Anything else would delete
 * or duplicate activities when the day's list is rebuilt from the ids.
 */
export function validateReorderIds(
  currentIds: readonly string[],
  orderedIds: readonly unknown[],
): ReorderValidation {
  const known = new Set(currentIds);
  const seen = new Set<string>();

  for (const id of orderedIds) {
    if (typeof id !== "string" || !known.has(id)) {
      return {
        ok: false,
        message: `Activity ${String(id)} not found in this day`,
      };
    }
    if (seen.has(id)) {
      return { ok: false, message: `Duplicate activity id ${id}` };
    }
    seen.add(id);
  }

  if (seen.size !== currentIds.length) {
    return {
      ok: false,
      message: `orderedActivityIds must include every activity of the day (${currentIds.length} expected, ${seen.size} received)`,
    };
  }
  return { ok: true };
}
