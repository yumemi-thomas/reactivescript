export default {
  imports: [["Listbox, ListboxLabel, ListboxButton, ListboxOptions, ListboxOption", "#terracotta/listbox"]],
  state: [["on", "string", "\"a\""]],
  part: "<Listbox defaultOpen={false} value={$on} onSelectChange={(v: string) => { $on := v }}><ListboxLabel>CHILD</ListboxLabel><ListboxButton>b</ListboxButton><ListboxOptions><ListboxOption value=\"a\">a</ListboxOption></ListboxOptions></Listbox>",
  handler: ["onSelectChange={(v: string) => { $on := v }}", "onSelectChange"],
  wrong: ["<Listbox ", "<Listbox disabled={$list} "],
  unknown: ["<ListboxOption value=\"a\">", "<ListboxOption>"],
  tag: "<ListboxOption",
  outside: "<ListboxOption value=\"x\">x</ListboxOption>",
  el: "HTMLLIElement",
  rx: [["Listbox, ListboxLabel, ListboxButton, ListboxOptions, ListboxOption", "#terracotta/menu"]],
};
