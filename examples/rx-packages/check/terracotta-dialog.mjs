export default {
  imports: [["Dialog, DialogPanel, DialogTitle, DialogOverlay", "#terracotta/dialog"]],
  state: [["on", "boolean", "false"]],
  part: "<Dialog isOpen={$on} onClose={() => { $on := false }}><DialogOverlay /><DialogPanel><DialogTitle>CHILD</DialogTitle></DialogPanel></Dialog>",
  handler: ["onClose={() => { $on := false }}", "onClose"],
  wrong: ["isOpen={$on}", "isOpen={$list}"],
  unknown: ["<Dialog ", "<Dialog opened={true} "],
  tag: "<DialogPanel",
  outside: "<DialogTitle>x</DialogTitle>",
  el: "HTMLDivElement",
  rx: [["Dialog, DialogPanel, DialogTitle, DialogOverlay", "#terracotta/disclosure"]],
};
