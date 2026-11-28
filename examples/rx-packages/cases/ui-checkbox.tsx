import { createSignal, Show, For } from "solid-js";
import { Checkbox, CheckboxIndicator } from "#ui-sdk/checkbox";
export const steps: any = [["click", "#t-c"], ["click", "#t-c"], ["press", "#t-c", "Space"], ["click", "#t-r"]];
export default function App() {
  const [v, setV] = createSignal<any>(false);
  return <><button id="t-r" onClick={() => setV(true)}>r</button><p>{String(v())}</p><Checkbox id="t-c" checked={v()} onCheckedChange={setV}><CheckboxIndicator>x</CheckboxIndicator></Checkbox></>;
}
