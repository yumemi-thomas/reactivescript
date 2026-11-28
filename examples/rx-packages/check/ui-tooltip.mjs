export default {
  imports: [["Tooltip, TooltipTrigger, TooltipContent", "#ui-sdk/tooltip"]],
  state: [["on", "boolean", "false"]],
  part: "<Tooltip open={$on} onOpenChange={(v: boolean) => { $on := v }}><TooltipTrigger>o</TooltipTrigger><TooltipContent>CHILD</TooltipContent></Tooltip>",
  handler: ["onOpenChange={(v: boolean) => { $on := v }}", "onOpenChange"],
  wrong: ["open={$on}", "open={$list}"],
  unknown: ["<Tooltip ", "<Tooltip opened={true} "],
  tag: "<TooltipTrigger",
  el: "HTMLButtonElement",
  outside: "<TooltipContent>t</TooltipContent>",
  rx: [["Tooltip, TooltipTrigger, TooltipContent", "#ui-sdk/controls"]],
  p2: ["<TooltipTrigger>o", "<TooltipTrigger><button>b</button>o"],
  p3: ["<Tooltip ", "<TooltipTrigger>x</TooltipTrigger><Tooltip "],
};
