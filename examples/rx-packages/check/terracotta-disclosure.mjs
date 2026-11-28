export default {
  imports: [["Disclosure, DisclosureButton, DisclosurePanel", "#terracotta/disclosure"]],
  state: [["on", "boolean", "false"]],
  part: "<Disclosure isOpen={$on} onChange={(v: boolean) => { $on := v }}><DisclosureButton>CHILD</DisclosureButton><DisclosurePanel>p</DisclosurePanel></Disclosure>",
  handler: ["onChange={(v: boolean) => { $on := v }}", "onChange"],
  wrong: ["isOpen={$on}", "isOpen={$list}"],
  unknown: ["<Disclosure ", "<Disclosure opened={true} "],
  tag: "<DisclosurePanel",
  outside: "<DisclosurePanel>p</DisclosurePanel>",
  el: "HTMLDivElement",
};
