import { createSignal, Show, For } from "solid-js";
import { Switch } from "#terracotta/switch";
export const steps: any = [["click", "button[role=switch]"], ["press", "button[role=switch]", "Space"]];
export default function App() {
  const [v, setV] = createSignal(false);
  return <><p>{v() ? "on" : "off"}</p><Switch checked={v()} onChange={setV}>S</Switch></>;
}
