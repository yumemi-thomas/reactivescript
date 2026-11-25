// A .tsx app's `render={(props, state) => …}`, as the part's `element` view.
import { createComponent, merge, omit, untrack } from "solid-js";
const childrenOf = (value, state) => typeof value === "function" && value.length > 0 ? value(state) : value;
export const withRender = (Part) => (p) => createComponent(Part, merge(omit(p, "render"), { get element() {
  const render = p.render;
  return render && ((e) => render(merge(() => e.attrs, { get children() { return childrenOf(p.children, e.state); } }), untrack(() => e.state)));
} }));
