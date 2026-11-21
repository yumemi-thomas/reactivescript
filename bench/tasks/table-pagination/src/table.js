// A Solid 2 adapter over @tanstack/table-core, as @tanstack/solid-table is for Solid 1: the table's state is a signal,
// so what the view reads from the table follows it; `options` is an accessor, so the table follows its data too.
import { createTable as createCoreTable } from "@tanstack/table-core";
import { createSignal, untrack, createComponent } from "solid-js";
export { getCoreRowModel, getPaginationRowModel } from "@tanstack/table-core";

export function createTable(options) {
  const first = untrack(options);
  const table = createCoreTable({ state: {}, onStateChange: () => {}, renderFallbackValue: null, ...first });
  const [state, setState] = createSignal(table.initialState);
  const live = { onStateChange: updater => { setState(prev => (typeof updater === "function" ? updater(prev) : updater)); } };
  for (const k of Object.keys(first)) Object.defineProperty(live, k, { enumerable: true, get: () => options()[k] });
  Object.defineProperty(live, "state", { enumerable: true, get: () => ({ ...state(), ...options().state }) });
  table.setOptions(prev => Object.defineProperties({ ...prev }, Object.getOwnPropertyDescriptors(live)));
  return table;
}
/** Renders a column's cell or header: a component is applied with the cell's context, anything else is shown. */
export function flexRender(Comp, props) {
  return typeof Comp === "function" ? createComponent(Comp, props) : Comp;
}
