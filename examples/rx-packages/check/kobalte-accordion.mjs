export default {
  imports: [["Root as Acc, Item, Header, Trigger, Content", "#kobalte/accordion"]],
  state: [["on", "string[]", "[\"a\"]"]],
  part: "<Acc value={$on} onChange={(v: string[]) => { $on := v }}><Item value=\"a\"><Header><Trigger>CHILD</Trigger></Header><Content>b</Content></Item></Acc>",
  handler: ["onChange={(v: string[]) => { $on := v }}", "onChange"],
  wrong: ["value={$on}", "value={$n}"],
  unknown: ["<Item value=\"a\">", "<Item>"],
  tag: "<Content",
  outside: "<Trigger>t</Trigger>",
  el: "HTMLDivElement",
  rx: [["Accordion as Acc, AccordionItem as Item, AccordionHeader as Header, AccordionTrigger as Trigger, AccordionContent as Content", "#kobalte/collapsible"]],
};
