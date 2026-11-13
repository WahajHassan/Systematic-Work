/**
 * Moving one id around a list, as two pure functions.
 *
 * Pure and on their own, deliberately. The last piece of list arithmetic
 * written inline in a hook - a one-line dedupe in `useStoredOrder` - was
 * wrong in a way nothing caught: `Set.add` returns the set, so a filter
 * built on it dropped every id and the saved order silently never applied.
 * It looked right and did nothing, which is the worst way for a bug to
 * behave.
 *
 * So the arithmetic lives here, where a test can call it with a list and
 * an answer rather than having to render a sidebar to find out.
 *
 * Neither function mutates what it is given, and neither trusts it: an id
 * that is not in the list comes back as the list, unchanged. The ids come
 * from a stored order and from a drag payload, and both are things a
 * browser has had its hands on.
 */

/** Swaps `id` with its neighbour. `by` is -1 for earlier, 1 for later. */
export function swapped(order: readonly string[], id: string, by: number): string[] {
  const from = order.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= order.length) return [...order];

  const next = [...order];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Puts `id` immediately before `beforeId`. */
export function movedBefore(
  order: readonly string[],
  id: string,
  beforeId: string,
): string[] {
  if (id === beforeId) return [...order];
  if (!order.includes(id)) return [...order];

  const next = order.filter((other) => other !== id);
  const at = next.indexOf(beforeId);
  // What it was dropped onto is not in the list, which means the list
  // changed under the drag. Doing nothing is right: the alternative is
  // putting it somewhere nobody pointed at.
  if (at < 0) return [...order];

  next.splice(at, 0, id);
  return next;
}

/** Where an id ended up, counted from 1, or 0 if it is not there. */
export function positionOf(order: readonly string[], id: string): number {
  return order.indexOf(id) + 1;
}
