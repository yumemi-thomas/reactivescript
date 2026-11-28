import { createSignal, Show, For } from "solid-js";
import { Root, List, Trigger, Content } from "#kobalte/tabs";
export const steps: any = [["click", "#t-b"], ["key", "ArrowRight"], ["click", "#t-a"]];
export default function App() {
  const [v, setV] = createSignal("a");
  return <><p>{v()}</p><Root value={v()} onChange={setV}><List><Trigger id="t-a" value="a">A</Trigger><Trigger id="t-b" value="b">B</Trigger><Trigger id="t-c" value="c">C</Trigger></List><Content value="a">aa</Content><Content value="b"><button>in</button></Content><Content value="c">cc</Content></Root></>;
}
