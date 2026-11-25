export default {
  imports: [["Menu, MenuItem", "#terracotta/menu"]],
  state: [["on", "string", "\"\""]],
  part: "<Menu><MenuItem onClick={() => { $on := \"a\" }}>CHILD</MenuItem></Menu>",
  handler: ["onClick={() => { $on := \"a\" }}", "onClick"],
  wrong: ["<MenuItem ", "<MenuItem disabled={$list} "],
  unknown: ["<Menu>", "<Menu opened={true}>"],
  tag: "<MenuItem",
  outside: "<MenuItem>x</MenuItem>",
  el: "HTMLLIElement",
};
