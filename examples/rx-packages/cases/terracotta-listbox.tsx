import { createSignal, Show, For } from "solid-js";
import { Listbox, ListboxLabel, ListboxButton, ListboxOptions, ListboxOption } from "#terracotta/listbox";
export const steps: any = [["click", "button"], ["key", "ArrowDown"], ["key", "Enter"], ["click", "button"], ["key", "Escape"]];
export default function App() {
  const [v, setV] = createSignal("a");
  return <><p>{v()}</p><Listbox defaultOpen={false} value={v()} onSelectChange={(x: any) => setV(x)}><ListboxLabel>L</ListboxLabel><ListboxButton>{v()}</ListboxButton><ListboxOptions><For each={["a", "b", "c"]}>{(k) => <ListboxOption value={k}>{k}</ListboxOption>}</For></ListboxOptions></Listbox></>;
}
