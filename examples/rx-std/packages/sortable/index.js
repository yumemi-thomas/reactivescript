import { createMemo, untrack } from "solid-js";
import * as core from "@rx-primitives/sortable/core";
import { compare } from "./src/comparators.js";
export { ascending, descending, by, combine, reverse, makeSorted, sortedIndex, sortedIndexBy, insertSorted } from "./src/comparators.js";
export { createSortedIndex } from "@rx-primitives/sortable/core";

// `dirty` sorts the caller's own list in place: no `.rx` value is changed behind its writes
export const createSorted = (list, comparator, options) =>
  options?.dirty ? createMemo(() => (typeof list === "function" ? list() : list).sort(compare(comparator))) : core.createSorted(list, comparator);
export const createSortedProjection = (list, comparator) => untrack(core.createSortedProjection(list, comparator));
