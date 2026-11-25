import { createSignal, Show, For } from "solid-js";
import { Root, Input, Control, Indicator, Label, Description } from "#kobalte/checkbox";
export const steps: any = [["click", "#t-c"], ["click", "#t-mix"], ["press", "input", "Space"], ["click", "#t-l"]];
export default function App() {
  const [v, setV] = createSignal(false); const [m, setM] = createSignal(false);
  return <><button id="t-mix" onClick={() => setM((x) => !x)}>m</button><p>{v() ? "y" : "n"}</p><Root checked={v()} onChange={setV} indeterminate={m()} required><Label id="t-l">L</Label><Description>d</Description><Input /><Control id="t-c"><Indicator>x</Indicator></Control></Root></>;
}
