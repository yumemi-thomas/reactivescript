import { createSignal, Show, For } from "solid-js";
import { Disclosure, DisclosureButton, DisclosurePanel } from "#terracotta/disclosure";
export const steps: any = [["click", "#t-b"], ["click", "#t-dis"], ["click", "#t-b"]];
export default function App() {
  const [v, setV] = createSignal(false);
  return <><button id="t-dis" onClick={() => setV(true)}>d</button><Disclosure defaultOpen={false} disabled={v()}><DisclosureButton class="b"><span id="t-b">b</span></DisclosureButton><DisclosurePanel>in</DisclosurePanel></Disclosure></>;
}
