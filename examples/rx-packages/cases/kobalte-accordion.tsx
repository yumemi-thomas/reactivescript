import { createSignal, Show, For } from "solid-js";
import { Root, Item, Header, Trigger, Content } from "#kobalte/accordion";
export const steps: any = [["click", "#t-a"], ["key", "ArrowDown"], ["key", "Enter"], ["click", "#t-more"], ["click", "#t-c"]];
export default function App() {
  const [v, setV] = createSignal(["a", "b"]);
  return <><button id="t-more" onClick={() => setV(["a", "b", "c"])}>m</button><Root collapsible><For each={v()}>{(k) => <Item value={k}><Header><Trigger id={"t-" + k}>{k}</Trigger></Header><Content>body {k}</Content></Item>}</For></Root></>;
}
