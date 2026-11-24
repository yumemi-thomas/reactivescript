import { createComponent } from "solid-js";
import { Radio } from "@ui-sdk/solid/radio";
export const probes = {
  RadioGroup: { props: () => ({ onValueChange: () => {}, get children() { return createComponent(Radio, { value: "a" }); } }), act: () => { [...document.querySelectorAll("[role=radio]")].at(-1).click(); } },
  Radio: { props: () => ({ value: "a" }) },
};
