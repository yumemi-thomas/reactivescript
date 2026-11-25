import { createSignal, Show, For } from "solid-js";
import { Root, Trigger, Portal, Content, Title, CloseButton } from "#kobalte/popover";
export const steps: any = [["click", "#t-o"], ["key", "Escape"], ["click", "#t-o"], ["click", "#t-x"]];
export default function App() {
  
  return <><Root gutter={4}><Trigger id="t-o">o</Trigger><Portal><Content class="co"><Title>T</Title><CloseButton id="t-x">x</CloseButton></Content></Portal></Root></>;
}
