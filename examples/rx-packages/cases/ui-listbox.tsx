import { createSignal, Show, For } from "solid-js";
import { Listbox, ListboxItem, ListboxItemIndicator } from "#ui-sdk/listbox";
export const steps: any = [["click", "#t-b"], ["key", "ArrowDown"], ["key", "Enter"], ["click", "#t-set"]];
export default function App() {
  const [v, setV] = createSignal<string[]>([]);
  return <><button id="t-set" onClick={() => setV(["a"])}>s</button><p>{String(v())}</p><Listbox multiple value={v()} onValueChange={setV}><For each={["a", "b", "c"]}>{(k) => <ListboxItem id={"t-" + k} value={k}>{k}<ListboxItemIndicator>*</ListboxItemIndicator></ListboxItem>}</For></Listbox></>;
}
