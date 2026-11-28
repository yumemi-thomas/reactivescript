import { createSignal, Show, For } from "solid-js";
import { Root, Trigger, Portal, Overlay, Content, Title, Description, CloseButton } from "#kobalte/dialog";
export const steps: any = [["click", "#t-o"], ["key", "Escape"], ["click", "#t-o"], ["click", "#t-x"]];
export default function App() {
  const [v, setV] = createSignal(false);
  return <><p>{v() ? "open" : "shut"}</p><Root open={v()} onOpenChange={setV}><Trigger id="t-o">o</Trigger><Portal><Overlay class="ov" /><Content class="co"><Title>T</Title><Description>D</Description><CloseButton id="t-x">x</CloseButton></Content></Portal></Root></>;
}
