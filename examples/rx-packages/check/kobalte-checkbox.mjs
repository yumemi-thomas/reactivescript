export default {
  imports: [["Root, Input, Control, Indicator, Label", "#kobalte/checkbox"]],
  state: [["on", "boolean", "false"]],
  part: "<Root checked={$on} onChange={(v: boolean) => { $on := v }}><Label>CHILD</Label><Input /><Control><Indicator>x</Indicator></Control></Root>",
  handler: ["onChange={(v: boolean) => { $on := v }}", "onChange"],
  wrong: ["checked={$on}", "checked={$list}"],
  unknown: ["<Control>", "<Control togled={true}>"],
  tag: "<Control",
  outside: "<Indicator>x</Indicator>",
  el: "HTMLDivElement",
};
