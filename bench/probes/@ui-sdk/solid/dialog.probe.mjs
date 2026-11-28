import { createComponent } from "solid-js";
import { DialogTrigger } from "@ui-sdk/solid/dialog";
export const probes = { Dialog: { props: () => ({ onOpenChange: () => {}, get children() { return createComponent(DialogTrigger, { class: "probe", children: "open" }); } }), act: () => { [...document.querySelectorAll("button.probe")].at(-1).click(); } } };
