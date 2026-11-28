import { MenuContent, Menu } from "@ui-sdk/solid/menu";
export const probes = { MenuItem: {
  props: () => ({ value: "a", onSelect: () => {}, children: "a" }),
  inside: (children, s) => s.createComponent(Menu, { defaultOpen: true, get children() { return s.createComponent(MenuContent, { get children() { return children(); } }); } }),
  act: async () => { await new Promise(r => setTimeout(r, 50)); const o = [...document.querySelectorAll("[role=menuitem]")].at(-1); for (const t of ["pointermove", "pointerdown", "pointerup"]) o.dispatchEvent(new PointerEvent(t, { bubbles: true, button: 0, pointerId: 1 })); o.click(); },
} };
