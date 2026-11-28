export default {
  imports: [["Root, Track, Fill, Label, ValueLabel", "#kobalte/progress"]],
  state: [["on", "number", "1"]],
  part: "<Root value={$on}><Label>CHILD</Label><ValueLabel /><Track><Fill /></Track></Root><button onClick={() => { $on := 2 }}>b</button>",
  handler: ["onClick={() => { $on := 2 }}", "onClick"],
  wrong: ["value={$on}", "value={$list}"],
  unknown: ["<Root ", "<Root valu={3} "],
  tag: "<Track",
  outside: "<Fill />",
  el: "HTMLDivElement",
  rx: [["Progress as Root, Track, Fill, Label, ValueLabel", "#kobalte/meter"]],
};
