export default {
  imports: [["Root, Label, Item, ItemInput, ItemControl, ItemLabel", "#kobalte/radio-group"]],
  state: [["on", "string", "\"a\""]],
  part: "<Root value={$on} onChange={(v: string) => { $on := v }}><Label>CHILD</Label><Item value=\"a\"><ItemInput /><ItemControl /><ItemLabel>a</ItemLabel></Item></Root>",
  handler: ["onChange={(v: string) => { $on := v }}", "onChange"],
  wrong: ["value={$on}", "value={$n}"],
  unknown: ["<Item value=\"a\">", "<Item>"],
  tag: "<ItemControl",
  outside: "<ItemLabel>x</ItemLabel>",
  el: "HTMLDivElement",
  rx: [["Root, Label, Item, ItemInput, ItemControl, ItemLabel", "#kobalte/radio"]],
};
