export default {
  imports: [["Check, CircleCheck", "#icons"]],
  state: [["on", "string", "\"red\""]],
  part: "<Check color={$on} size={20} /><button onClick={() => { $on := \"blue\" }}>CHILD</button>",
  handler: ["onClick={() => { $on := \"blue\" }}", "onClick"],
  wrong: ["size={20}", "size={$list}"],
  unknown: ["<Check ", "<Check colour=\"x\" "],
  tag: "<Check",
  el: "SVGSVGElement",
  ref: false,
  p1: ["<Check ", "<Check><div>b</div></Check><Check "],
};
