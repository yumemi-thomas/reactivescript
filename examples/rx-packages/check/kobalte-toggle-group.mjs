export default {
  imports: [["Root, Item", "#kobalte/toggle-group"]],
  state: [["on", "string[]", "[]"]],
  part: "<Root multiple={true} value={$on} onChange={(v: string[]) => { $on := v }}><Item value=\"a\">CHILD</Item></Root>",
  handler: ["onChange={(v: string[]) => { $on := v }}", "onChange"],
  wrong: ["value={$on}", "value={$n}"],
  unknown: ["<Item value=\"a\">", "<Item>"],
  tag: "<Item",
  outside: "<Item value=\"z\">z</Item>",
  el: "HTMLButtonElement",
  rx: [["ToggleGroup as Root, ToggleGroupItem as Item", "#kobalte/button"]],
  p2: ["CHILD", "<button>b</button>CHILD"],
};
