export default {
  imports: [["Checkbox, CheckboxIndicator", "#ui-sdk/checkbox"]],
  state: [["on", "boolean", "false"]],
  part: "<Checkbox checked={$on} onCheckedChange={(v: boolean) => { $on := v }}><CheckboxIndicator>CHILD</CheckboxIndicator></Checkbox>",
  handler: ["onCheckedChange={(v: boolean) => { $on := v }}", "onCheckedChange"],
  wrong: ["checked={$on}", "checked={$n}"],
  unknown: ["<Checkbox ", "<Checkbox chekced={true} "],
  tag: "<Checkbox",
  el: "HTMLButtonElement",
  outside: "<CheckboxIndicator>x</CheckboxIndicator>",
  rx: [["Checkbox, CheckboxIndicator", "#ui-sdk/controls"]],
  p2: ["CHILD", "<button>b</button>CHILD"],
};
