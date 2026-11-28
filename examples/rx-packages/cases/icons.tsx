import { createSignal, Show, For } from "solid-js";
import { Check, CircleCheck } from "#icons";
export const steps: any = [["click", "#t-b"]];
export default function App() {
  const [v, setV] = createSignal("blue");
  return <><button id="t-b" onClick={() => setV("red")}>b</button><Check color={v()} size={30} class="mine" /><CircleCheck aria-label="ok" /></>;
}
