// A Solid 2 adapter over @tanstack/table-core, as @tanstack/solid-table is for Solid 1: the table's state is a signal
// and its options a lazy merge, so what the view reads from the table follows the state and the data it was made from.
import { createTable as createCoreTable } from "@tanstack/table-core";
import { createSignal, createMemo, merge, untrack, createComponent } from "solid-js";
export { getCoreRowModel, getPaginationRowModel } from "@tanstack/table-core";

export function createTable(options) {
  const lazy = (defaults, opts) => merge(defaults, opts);
  const table = untrack(() => createCoreTable(merge({ state: {}, onStateChange: () => {}, renderFallbackValue: null, mergeOptions: lazy }, options)));
  const [state, setState] = createSignal(table.initialState);
  // table-core knows its data changed by its identity, and a Solid 2 store (an .rx source of records is one) keeps one
  // identity for its life: the table is given a fresh array whenever the rows change
  const data = createMemo(() => [...options().data]);
  table.setOptions(prev => merge(prev, options, {
    get data() { return data(); },
    get state() { return { ...state(), ...options().state }; },
    onStateChange: updater => { setState(old => (typeof updater === "function" ? updater(old) : updater)); },
  }));
  return table;
}
/** Renders a column's cell or header: a component is applied with the cell's context, anything else is shown. */
export function flexRender(Comp, props) {
  return typeof Comp === "function" ? createComponent(Comp, props) : Comp;
}
