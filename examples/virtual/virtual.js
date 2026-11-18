// A virtual list on @tanstack/virtual-core for Solid 2.0, with a render prop: <VirtualList items={…} height={…} size={…}>
// {(item, index) => <Row …/>}</VirtualList>. Only the rows in view are rendered; `children` is called for each one.
import { createSignal, createEffect, onCleanup, untrack, For } from "solid-js";
import { insert, createComponent } from "@solidjs/web";
import { Virtualizer, elementScroll, observeElementOffset, observeElementRect } from "@tanstack/virtual-core";

export function VirtualList(props) {
  const outer = document.createElement("div");
  outer.className = "vlist";
  outer.style.overflow = "auto";
  outer.style.height = `${untrack(() => props.height ?? 300)}px`;
  const inner = document.createElement("div");
  inner.style.position = "relative";
  inner.style.width = "100%";
  outer.appendChild(inner);
  const [rows, setRows] = createSignal([]);
  const sync = v => { setRows(v.getVirtualItems().slice()); inner.style.height = `${v.getTotalSize()}px`; };
  const v = new Virtualizer({
    count: untrack(() => props.items.length),
    getScrollElement: () => outer,
    estimateSize: () => untrack(() => props.size ?? 30),
    overscan: 2,
    scrollToFn: elementScroll, observeElementRect, observeElementOffset,
    onChange: sync,
  });
  onCleanup(v._didMount());
  createEffect(() => props.items.length, count => { v.setOptions({ ...v.options, count }); v._willUpdate(); sync(v); });
  insert(inner, () => createComponent(For, {
    get each() { return rows(); },
    keyed: false,
    children: vi => {
      const row = document.createElement("div");
      row.className = "vrow";
      row.style.position = "absolute"; row.style.top = "0"; row.style.left = "0"; row.style.width = "100%";
      createEffect(() => [vi().start, vi().size], ([start, size]) => { row.style.transform = `translateY(${start}px)`; row.style.height = `${size}px`; });
      insert(row, () => props.children(props.items[vi().index], vi().index));
      return row;
    },
  }));
  if (!props.header) return outer;
  const box = document.createElement("div");
  const head = document.createElement("div"); head.className = "vhead";
  insert(head, () => props.header(props.items.length));
  box.append(head, outer);
  return box;
}
