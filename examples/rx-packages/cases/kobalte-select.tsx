import { createSignal, Show, For } from "solid-js";
import { Root, Label, Trigger, Value, Icon, Portal, Content, Listbox, Item, ItemLabel, ItemIndicator } from "#kobalte/select";
export const steps: any = [["click", "#t-o"], ["key", "ArrowDown"], ["key", "Enter"], ["click", "#t-o"], ["key", "Escape"]];
export default function App() {
  const OPTS = [{ id: "1", label: "One" }, { id: "2", label: "Two" }]; const [v, setV] = createSignal<any>(null);
  return <><p>{v()?.label}</p><Root options={OPTS} optionValue="id" optionTextValue="label" placeholder="pick" value={v()} onChange={setV} itemComponent={(p: any) => <Item item={p.item}><ItemLabel>{p.item.rawValue.label}</ItemLabel><ItemIndicator>*</ItemIndicator></Item>}><Label>L</Label><Trigger id="t-o"><Value>{(s: any) => s.selectedOption().label}</Value><Icon /></Trigger><Portal><Content><Listbox /></Content></Portal></Root></>;
}
