export default {
  imports: [["Switch", "#terracotta/switch"]],
  state: [["on", "boolean", "false"]],
  part: "<Switch checked={$on} onChange={(v: boolean) => { $on := v }}>CHILD</Switch>",
  handler: ["onChange={(v: boolean) => { $on := v }}", "onChange"],
  wrong: ["checked={$on}", "checked={$list}"],
  unknown: ["<Switch ", "<Switch togled={true} "],
  tag: "<Switch",
  el: "HTMLButtonElement",
  p2: ["CHILD", "<button>b</button>CHILD"],
};
