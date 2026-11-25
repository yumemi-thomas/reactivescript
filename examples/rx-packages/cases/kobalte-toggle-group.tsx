import { createSignal, Show, For } from "solid-js";
import { Root, Item } from "#kobalte/toggle-group";
export const steps: any = [["click", "#t-a"], ["key", "ArrowRight"], ["key", "Enter"], ["click", "#t-off"]];
export default function App() {
  const [v, setV] = createSignal<string[]>(["b"]);
  return <><button id="t-off" onClick={() => setV([])}>o</button><Root multiple value={v()} onChange={(x: string[]) => setV(x)}><Item id="t-a" value="a">A</Item><Item value="b">{(s: any) => <i>{typeof s.pressed === "function" ? (s.pressed() ? "B!" : "B") : s.pressed ? "B!" : "B"}</i>}</Item><Item value="c" disabled>C</Item></Root></>;
}
