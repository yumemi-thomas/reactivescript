import { createSignal, Show, For } from "solid-js";
import { Command } from "#cmdk";
export const steps: any = [["fill", "[cmdk-input]", "ca"], ["key", "ArrowDown"], ["key", "Enter"], ["fill", "[cmdk-input]", "zzz"], ["fill", "[cmdk-input]", ""], ["click", "#t-more"]];
export default function App() {
  const [v, setV] = createSignal(""); const [m, setM] = createSignal(false);
  return <><button id="t-more" onClick={() => setM(true)}>m</button><p>{v()}</p><Command label="menu"><Command.Input /><Command.List><Command.Empty>none</Command.Empty><Command.Group heading="Fruit"><Command.Item onSelect={setV}>Apple</Command.Item><Command.Item onSelect={setV}>Carrot</Command.Item></Command.Group><Command.Separator /><Command.Item onSelect={setV} keywords={["cat"]}>Dog</Command.Item><Show when={m()}><Command.Item>Egg</Command.Item></Show></Command.List></Command></>;
}
