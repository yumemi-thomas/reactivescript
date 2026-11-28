import { createSignal, Show, For } from "solid-js";
import { RadioGroup, RadioGroupOption, RadioGroupLabel } from "#terracotta/radio-group";
export const steps: any = [["click", "[role=radio]:nth-of-type(2)"], ["key", "ArrowUp"], ["click", "#t-set"]];
export default function App() {
  const [v, setV] = createSignal("a");
  return <><button id="t-set" onClick={() => setV("b")}>s</button><p>{v()}</p><RadioGroup value={v()} onChange={(x: any) => setV(x)}><RadioGroupLabel>L</RadioGroupLabel><For each={["a", "b"]}>{(k) => <RadioGroupOption value={k}>{k}</RadioGroupOption>}</For></RadioGroup></>;
}
