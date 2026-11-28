export default {
  imports: [["Accordion, AccordionItem, AccordionHeader, AccordionTrigger, AccordionPanel", "#ui-sdk/accordion"]],
  state: [["on", "string[]", "[]"]],
  part: "<Accordion value={$on} onValueChange={(v: string[]) => { $on := v }}><AccordionItem value=\"a\"><AccordionHeader><AccordionTrigger>CHILD</AccordionTrigger></AccordionHeader><AccordionPanel>p</AccordionPanel></AccordionItem></Accordion>",
  handler: ["onValueChange={(v: string[]) => { $on := v }}", "onValueChange"],
  wrong: ["value={$on}", "value={$n}"],
  unknown: ["<AccordionItem value=\"a\">", "<AccordionItem>"],
  tag: "<AccordionPanel",
  el: "HTMLDivElement",
  outside: "<AccordionPanel>x</AccordionPanel>",
  rx: [["Accordion, AccordionItem, AccordionHeader, AccordionTrigger, AccordionPanel", "#ui-sdk/controls"]],
};
