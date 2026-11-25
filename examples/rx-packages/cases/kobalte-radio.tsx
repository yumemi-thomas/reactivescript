import { createSignal, Show, For } from "solid-js";
import { Root, Label, Item, ItemInput, ItemControl, ItemIndicator, ItemLabel } from "#kobalte/radio-group";
export const steps: any = [["click", "#t-b"], ["click", "#t-set"], ["press", "input[value=a]", "ArrowDown"]];
export default function App() {
  const [v, setV] = createSignal("a");
  return <><button id="t-set" onClick={() => setV("a")}>s</button><p>{v()}</p><Root value={v()} onChange={setV}><Label>L</Label><For each={["a", "b"]}>{(k) => <Item value={k}><ItemInput /><ItemControl id={"t-" + k}><ItemIndicator>*</ItemIndicator></ItemControl><ItemLabel>{k}</ItemLabel></Item>}</For></Root></>;
}
