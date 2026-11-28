import { createSignal, Show, For } from "solid-js";
import { Root, Trigger, Portal, Content } from "#kobalte/tooltip";
export const steps: any = [["focus", "#t-o"], ["key", "Escape"], ["hover", "#t-o"], ["wait", 250], ["hover", "#t-y"], ["wait", 250]];
export default function App() {
  
  return <><Root openDelay={100} closeDelay={100}><Trigger id="t-o">o</Trigger><Portal><Content class="co">tip</Content></Portal></Root><p id="t-y" style="margin-top:200px">y</p></>;
}
