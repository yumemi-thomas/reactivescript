export default {
  imports: [["Root, List, Trigger, Content", "#kobalte/tabs"]],
  state: [["on", "string", "\"a\""]],
  part: "<Root value={$on} onChange={(v: string) => { $on := v }}><List><Trigger value=\"a\">CHILD</Trigger></List><Content value=\"a\">b</Content></Root>",
  handler: ["onChange={(v: string) => { $on := v }}", "onChange"],
  wrong: ["value={$on}", "value={$n}"],
  unknown: ["<Content value=\"a\">", "<Content>"],
  tag: "<List",
  outside: "<Trigger value=\"z\">z</Trigger>",
  el: "HTMLDivElement",
};
