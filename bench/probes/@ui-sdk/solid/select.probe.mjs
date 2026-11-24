import { createComponent } from "solid-js";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui-sdk/solid/select";
const item = value => createComponent(SelectItem, { value, children: value });
export const probes = { Select: {
  props: () => ({ defaultOpen: true, onValueChange: () => {}, get children() { return [createComponent(SelectTrigger, { get children() { return createComponent(SelectValue, {}); } }), createComponent(SelectContent, { get children() { return [item("a"), item("b")]; } })]; } }),
  act: async () => { await new Promise(r => setTimeout(r, 50)); const o = [...document.querySelectorAll("[role=option]")].at(-1); for (const t of ["pointermove", "pointerdown", "pointerup"]) o.dispatchEvent(new PointerEvent(t, { bubbles: true, button: 0, pointerId: 1 })); o.click(); },
} };
