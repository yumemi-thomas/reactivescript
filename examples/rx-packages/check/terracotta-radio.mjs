export default {
  imports: [["RadioGroup, RadioGroupOption, RadioGroupLabel", "#terracotta/radio-group"]],
  state: [["on", "string", "\"a\""]],
  part: "<RadioGroup value={$on} onChange={(v: string) => { $on := v }}><RadioGroupLabel>CHILD</RadioGroupLabel><RadioGroupOption value=\"a\">a</RadioGroupOption></RadioGroup>",
  handler: ["onChange={(v: string) => { $on := v }}", "onChange"],
  wrong: ["<RadioGroup ", "<RadioGroup disabled={$list} "],
  unknown: ["<RadioGroupOption value=\"a\">", "<RadioGroupOption>"],
  tag: "<RadioGroupOption",
  outside: "<RadioGroupOption value=\"x\">x</RadioGroupOption>",
  el: "HTMLDivElement",
  rx: [["RadioGroup, RadioGroupOption, RadioGroupLabel", "#terracotta/menu"]],
};
