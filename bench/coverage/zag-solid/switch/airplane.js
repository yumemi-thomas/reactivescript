import { useMachine, normalizeProps } from "@zag-js/solid";
import * as zag from "@zag-js/switch";
import { createMemo } from "solid-js";
/** A switch's machine: whether it is on, and what flips it. */
export function airplane() {
  const service = useMachine(zag.machine, { id: "air" });
  const api = createMemo(() => zag.connect(service, normalizeProps));
  return { checked: () => api().checked, toggle: () => { api().toggleChecked(); } };
}
