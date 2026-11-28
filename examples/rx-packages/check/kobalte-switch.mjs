export default {
  imports: [["Root, Input, Control, Thumb, Label", "#kobalte/switch"]], state: [["on", "boolean", "false"]],
  part: `<Root checked={$on} onChange={(v: boolean) => { $on := v }}><Label>CHILD</Label><Input /><Control><Thumb /></Control></Root>`,
  handler: ["onChange={(v: boolean) => { $on := v }}", "onChange"], outside: "<Thumb />", wrong: ["checked={$on}", "checked={$list}"], unknown: ["<Control>", "<Control togled={true}>"], tag: "<Control", el: "HTMLDivElement",
};
