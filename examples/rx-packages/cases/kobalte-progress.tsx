import { createSignal, Show, For } from "solid-js";
import { Root, Track, Fill, Label, ValueLabel } from "#kobalte/progress";
export const steps: any = [["click", "#t-b"], ["click", "#t-i"]];
export default function App() {
  const [v, setV] = createSignal(20); const [i, setI] = createSignal(false);
  return <><button id="t-b" onClick={() => setV((x) => x + 30)}>b</button><button id="t-i" onClick={() => setI(true)}>i</button><Root value={v()} indeterminate={i()}><Label>L</Label><ValueLabel /><Track><Fill /></Track></Root></>;
}
