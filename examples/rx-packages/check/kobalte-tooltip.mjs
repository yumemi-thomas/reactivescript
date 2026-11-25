export default {
  imports: [["Root, Trigger, Portal, Content", "#kobalte/tooltip"]],
  state: [["on", "boolean", "false"]],
  part: "<Root open={$on} onOpenChange={(v: boolean) => { $on := v }}><Trigger>o</Trigger><Portal><Content>CHILD</Content></Portal></Root>",
  handler: ["onOpenChange={(v: boolean) => { $on := v }}", "onOpenChange"],
  wrong: ["open={$on}", "open={$list}"],
  unknown: ["<Root ", "<Root opened={true} "],
  tag: "<Content",
  outside: "<Content>t</Content>",
  el: "HTMLDivElement",
  rx: [["Root, Trigger, Page as Portal, Content", "#kobalte/tooltip"]],
  p2: ["<Trigger>o", "<Trigger><button>b</button>o"],
  p3: ["<Root ", "<Trigger>x</Trigger><Root "],
};
