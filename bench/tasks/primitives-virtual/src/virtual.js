// A Solid 2 adapter over @tanstack/virtual-core, as @tanstack/solid-virtual is for Solid 1 (its own uses createComputed,
// onMount and mergeProps, which Solid 2 removed). Headless: the app renders the rows. It hands back accessors, so `.rx`
// reads them as values.
import { createSignal, createEffect, onCleanup, untrack } from "solid-js";
import { Virtualizer, elementScroll, observeElementOffset, observeElementRect } from "@tanstack/virtual-core";

export function createVirtualizer(options) {
  const [items, setItems] = createSignal([]);
  const [totalSize, setTotalSize] = createSignal(0);
  const sync = v => { setItems(v.getVirtualItems().slice()); setTotalSize(v.getTotalSize()); };
  // the library asks for the scroll element inside its own updates: read there without tracking
  const opts = () => { const o = options(); return { ...o, getScrollElement: () => untrack(o.getScrollElement) }; };
  const v = new Virtualizer({ ...untrack(opts), scrollToFn: elementScroll, observeElementRect, observeElementOffset, onChange: sync });
  createEffect(() => { const o = opts(); return [o.count, o.getScrollElement()]; }, ([count]) => {
    v.setOptions({ ...v.options, ...untrack(opts), count, scrollToFn: elementScroll, observeElementRect, observeElementOffset, onChange: sync });
    const cleanup = v._didMount(); v._willUpdate(); sync(v); return cleanup;
  });
  onCleanup(() => v._didMount?.call(v)?.());
  return { items, totalSize, scrollToIndex: i => v.scrollToIndex(i) };
}
