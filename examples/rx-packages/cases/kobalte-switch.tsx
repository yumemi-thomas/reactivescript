import { createSignal, Show } from "solid-js";
import { Root, Input, Control, Thumb, Label, Description, ErrorMessage } from "#kobalte/switch";
export const steps: any = [["click", "#t-control"], ["click", "#t-all"], ["press", "input", "Space"], ["click", "#t-bad"], ["click", "#t-label"]];
export default function App() {
  const [on, setOn] = createSignal(false); const [bad, setBad] = createSignal(false); const [gone, setGone] = createSignal(false);
  return <><p>{on() ? "on" : "off"}</p><button id="t-all" onClick={() => setOn((v) => !v)}>x</button><button id="t-bad" onClick={() => { setBad(true); setGone(true); }}>b</button>
    <Root checked={on()} onChange={setOn} validationState={bad() ? "invalid" : "valid"} class="r" name="wifi">
      <Label id="t-label">Wifi</Label><Description>d</Description><ErrorMessage>bad</ErrorMessage><Input />
      <Show when={!gone()}><Control id="t-control" class="c"><Thumb /></Control></Show>
    </Root></>;
}
