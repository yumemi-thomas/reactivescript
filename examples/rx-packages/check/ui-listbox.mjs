export default {
  imports: [["Listbox, ListboxItem, ListboxItemIndicator", "#ui-sdk/listbox"]],
  state: [["on", "string[]", "[]"]],
  part: "<Listbox value={$on} onValueChange={(v: string[]) => { $on := v }}><ListboxItem value=\"a\">CHILD<ListboxItemIndicator>*</ListboxItemIndicator></ListboxItem></Listbox>",
  handler: ["onValueChange={(v: string[]) => { $on := v }}", "onValueChange"],
  wrong: ["value={$on}", "value={$n}"],
  unknown: ["<ListboxItem value=\"a\">", "<ListboxItem>"],
  tag: "<ListboxItem",
  el: "HTMLDivElement",
  outside: "<ListboxItemIndicator>x</ListboxItemIndicator>",
  rx: [["Listbox, ListboxItem, ListboxItemIndicator", "#ui-sdk/controls"]],
};
