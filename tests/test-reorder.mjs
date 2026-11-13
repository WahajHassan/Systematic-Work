/**
 * Moving an entry around a menu.
 *
 * Worth its own suite because the last piece of list arithmetic in this
 * corner shipped broken and nothing noticed: a one-line dedupe inside
 * `useStoredOrder` used `Set.add` as a predicate, `Set.add` returns the
 * set, so every stored id was dropped and a saved order silently never
 * applied. It looked right and did nothing.
 *
 * Three screens now rearrange lists with these two functions - the admin
 * menu, the business sidebar and the tab strips - so a mistake here is a
 * mistake in all three, and in the one place a person notices least: a
 * menu that quietly puts itself back.
 *
 * Pure, so no database.
 *
 *   node --experimental-strip-types scripts/test-reorder.mjs
 */
import { movedBefore, positionOf, swapped } from "../src/lib/reorder.ts";

let pass = 0;
let fail = 0;

function check(name, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    pass++;
    console.log("  ok   " + name);
  } else {
    fail++;
    console.log(
      `  FAIL ${name}\n         got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`,
    );
  }
}

const LIST = ["a", "b", "c", "d"];

console.log("\n--- swapping with a neighbour ---");
check("later moves one down", swapped(LIST, "b", 1), ["a", "c", "b", "d"]);
check("earlier moves one up", swapped(LIST, "c", -1), ["a", "c", "b", "d"]);
check("the first cannot go earlier", swapped(LIST, "a", -1), LIST);
check("the last cannot go later", swapped(LIST, "d", 1), LIST);
check("an id that is not there changes nothing", swapped(LIST, "z", 1), LIST);

// The reason the hook can compare before with after instead of deciding
// twice whether a move was allowed: a refused move returns the list.
check("a refused move is the same list", swapped(LIST, "a", -1), LIST);

console.log("\n--- dropping before another ---");
check("backwards over one", movedBefore(LIST, "c", "b"), ["a", "c", "b", "d"]);
check("backwards to the front", movedBefore(LIST, "d", "a"), ["d", "a", "b", "c"]);
/*
  Forwards is the case worth reading twice. Removing "a" first shifts
  everything left, so inserting before "d" lands it at index 2 - which is
  after "c", exactly where the pointer was. Doing the insert before the
  removal would put it one place too far.
*/
check("forwards lands before the target", movedBefore(LIST, "a", "d"), [
  "b",
  "c",
  "a",
  "d",
]);
check("onto itself changes nothing", movedBefore(LIST, "b", "b"), LIST);
check("an unknown target changes nothing", movedBefore(LIST, "b", "z"), LIST);
check("an unknown mover changes nothing", movedBefore(LIST, "z", "b"), LIST);

console.log("\n--- nothing is lost or duplicated ---");
// The failure that would be invisible on screen for a while: a move that
// drops an entry, or leaves two of it. Every result above is checked for
// both here rather than trusting each case to have been written out right.
for (const [name, got] of [
  ["swap", swapped(LIST, "b", 1)],
  ["drop backwards", movedBefore(LIST, "c", "b")],
  ["drop forwards", movedBefore(LIST, "a", "d")],
  ["drop to the front", movedBefore(LIST, "d", "a")],
]) {
  check(`${name} keeps all four`, [...got].sort(), [...LIST].sort());
  check(`${name} keeps them unique`, new Set(got).size, LIST.length);
}

console.log("\n--- the originals are left alone ---");
const original = ["a", "b", "c", "d"];
swapped(original, "a", 1);
movedBefore(original, "d", "a");
check("neither function mutates what it was given", original, LIST);

console.log("\n--- where something ended up ---");
check("counted from one", positionOf(LIST, "a"), 1);
check("the last one", positionOf(LIST, "d"), 4);
// Zero rather than -1, so "did it move?" can be asked of two lists without
// either of them having to know the id is missing from both.
check("missing is zero", positionOf(LIST, "z"), 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
