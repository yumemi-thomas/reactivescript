import { createSignal, Show, For } from "solid-js";
import { Switch, SwitchThumb } from "#ui-sdk/switch";
export const steps: any = [["click", "#t-c"], ["press", "#t-c", "Space"]];
export default function App() {
  const [v, setV] = createSignal<any>(false);
  return <><p>{String(v())}</p><Switch id="t-c" defaultChecked={false} onCheckedChange={setV}><SwitchThumb /></Switch></>;
}
