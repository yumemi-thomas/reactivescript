export default {
  imports: [["Switch, SwitchThumb", "#ui-sdk/switch"]],
  state: [["on", "boolean", "false"]],
  part: "<Switch checked={$on} onCheckedChange={(v: boolean) => { $on := v }}><SwitchThumb>CHILD</SwitchThumb></Switch>",
  handler: ["onCheckedChange={(v: boolean) => { $on := v }}", "onCheckedChange"],
  wrong: ["checked={$on}", "checked={$n}"],
  unknown: ["<Switch ", "<Switch chekced={true} "],
  tag: "<Switch",
  el: "HTMLButtonElement",
  outside: "<SwitchThumb>x</SwitchThumb>",
  rx: [["Switch, SwitchThumb", "#ui-sdk/controls"]],
  p2: ["CHILD", "<button>b</button>CHILD"],
};
