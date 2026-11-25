export default {
  imports: [["Root, Label, Trigger, Value, Portal, Content, Listbox, Item, ItemLabel", "#kobalte/select"]],
  state: [["on", "string | null", "null"]],
  part: "<Root options={$list} value={$on} onChange={(v: string | null) => { $on := v }} itemComponent={(p) => <Item item={p.item}><ItemLabel>{p.item.rawValue}</ItemLabel></Item>}><Label>CHILD</Label><Trigger>o</Trigger><Portal><Content><Listbox /></Content></Portal></Root>",
  rxPart: "<Root options={$list} value={$on} onChange={(v: string | null) => { $on := v }}>{view itemComponent (p) { <Item item={p.item}><ItemLabel>{p.item.rawValue}</ItemLabel></Item> }}<Label>CHILD</Label><Trigger>o</Trigger><Portal><Content><Listbox /></Content></Portal></Root>",
  handler: ["onChange={(v: string | null) => { $on := v }}", "onChange"],
  wrong: ["options={$list}", "options={$n}"],
  unknown: ["<Root ", "<Root opend={true} "],
  tag: "<Content",
  outside: "<Listbox />",
  el: "HTMLDivElement",
  rx: [["Root, Label, Trigger, Value, Page as Portal, Content, Listbox, Option as Item, ItemLabel", "#kobalte/select"]],
};
