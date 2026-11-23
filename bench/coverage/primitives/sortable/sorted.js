// A sorted view of a list, as solid-primitives sorts it into a copy. The library's createSorted also sorts the list it
// is given in place when it is asked to (`{ dirty: true }`, sort.js), so its own row cannot say `pure`; this module
// never asks, and rx-declare reads that from the call (09 MO-8w: a call is read with the arguments it is given).
import { createSorted } from "@solid-primitives/sortable";
export const sortedBy = (list, comparator) => createSorted(list, comparator);
