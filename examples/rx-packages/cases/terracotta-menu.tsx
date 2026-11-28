import { createSignal, Show, For } from "solid-js";
import { Menu, MenuItem } from "#terracotta/menu";
export const steps: any = [["focus", "[role=menuitem]"], ["key", "ArrowDown"], ["key", "c"], ["key", "Enter"], ["key", "Home"]];
export default function App() {
  const [v, setV] = createSignal("");
  return <><p>{v()}</p><Menu><MenuItem onClick={() => setV("a")}>alpha</MenuItem><MenuItem disabled>beta</MenuItem><MenuItem onClick={() => setV("c")}>cee</MenuItem></Menu></>;
}
