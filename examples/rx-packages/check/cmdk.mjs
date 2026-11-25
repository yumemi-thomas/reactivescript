export default {
  imports: [["Command, CommandInput, CommandList, CommandItem, CommandGroup", "#cmdk"]],
  state: [["on", "string", "\"\""]],
  part: "<Command label=\"m\"><CommandInput /><CommandList><CommandGroup heading=\"g\"><CommandItem onSelect={(v: string) => { $on := v }}>CHILD</CommandItem></CommandGroup></CommandList></Command>",
  handler: ["onSelect={(v: string) => { $on := v }}", "onSelect"],
  wrong: ["<Command ", "<Command shouldFilter={$list} "],
  unknown: ["<CommandItem ", "<CommandItem forcemount={true} "],
  tag: "<CommandItem",
  outside: "<CommandItem>x</CommandItem>",
  el: "HTMLDivElement",
  rx: [["Command, Input as CommandInput, List as CommandList, Item as CommandItem, Group as CommandGroup", "#cmdk"]],
};
