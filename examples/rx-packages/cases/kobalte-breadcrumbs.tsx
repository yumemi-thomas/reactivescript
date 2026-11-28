import { createSignal, Show, For } from "solid-js";
import { Root, Link, Separator } from "#kobalte/breadcrumbs";
export const steps: any = [["click", "#t-b"]];
export default function App() {
  const [v, setV] = createSignal(false);
  return <><button id="t-b" onClick={() => setV(true)}>b</button><Root separator={<b>/</b>}><ol><li><Link href="/">home</Link><Separator /></li><li><Link href="/x" current={v()}>x</Link></li></ol></Root></>;
}
