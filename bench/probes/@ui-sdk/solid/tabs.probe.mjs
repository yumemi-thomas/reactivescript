import { createComponent } from "solid-js";
import { TabsList, TabsTab } from "@ui-sdk/solid/tabs";
const tab = value => createComponent(TabsTab, { value, children: value });
export const probes = { Tabs: { props: () => ({ defaultValue: "a", onValueChange: () => {}, get children() { return createComponent(TabsList, { get children() { return [tab("a"), tab("b")]; } }); } }), act: () => { [...document.querySelectorAll("[role=tab]")].at(-1).click(); } } };
