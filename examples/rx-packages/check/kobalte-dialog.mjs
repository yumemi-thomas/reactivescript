export default {
  imports: [["Root, Trigger, Portal, Overlay, Content, Title, CloseButton", "#kobalte/dialog"]],
  state: [["on", "boolean", "false"]],
  part: "<Root open={$on} onOpenChange={(v: boolean) => { $on := v }}><Trigger>o</Trigger><Portal><Overlay /><Content><Title>CHILD</Title><CloseButton>x</CloseButton></Content></Portal></Root>",
  handler: ["onOpenChange={(v: boolean) => { $on := v }}", "onOpenChange"],
  wrong: ["open={$on}", "open={$list}"],
  unknown: ["<Root ", "<Root opened={true} "],
  tag: "<Content",
  outside: "<Title>t</Title>",
  el: "HTMLDivElement",
  rx: [["Root, Trigger, Page as Portal, Overlay, Content, Title, CloseButton", "#kobalte/dialog"]],
  p2: ["<Title>CHILD", "<Title><div>b</div>CHILD"],
  p3: ["<Trigger>o", "<Trigger><button>b</button>o"],
};
