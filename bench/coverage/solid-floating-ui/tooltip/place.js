import { untrack } from "solid-js";
import { useFloating } from "solid-floating-ui";
/** What a view needs to place one element beside another. */
export function place(open) {
  const made = useFloating({ get open() { return open(); }, placement: "bottom" });
  return { reference: el => untrack(() => made.refs.setReference(el)), floating: el => untrack(() => made.refs.setFloating(el)), styles: () => made.floatingStyles };
}
