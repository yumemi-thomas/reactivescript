import { createSignal, Show, For } from "solid-js";
import { Accordion, AccordionItem, AccordionHeader, AccordionTrigger, AccordionPanel } from "#ui-sdk/accordion";
export const steps: any = [["click", "#t-a"], ["key", "ArrowDown"], ["key", "Enter"], ["click", "#t-a"]];
export default function App() {
  
  return <><Accordion multiple><For each={["a", "b"]}>{(k) => <AccordionItem value={k}><AccordionHeader><AccordionTrigger id={"t-" + k}>{k}</AccordionTrigger></AccordionHeader><AccordionPanel>body {k}</AccordionPanel></AccordionItem>}</For></Accordion></>;
}
