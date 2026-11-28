import { createSignal, Show, For } from "solid-js";
import { Dialog, DialogPanel, DialogTitle, DialogOverlay } from "#terracotta/dialog";
export const steps: any = [["click", "#t-o"], ["key", "Escape"], ["click", "#t-o"], ["click", "#t-x"]];
export default function App() {
  const [v, setV] = createSignal(false);
  return <><button id="t-o" onClick={() => setV(true)}>o</button><Dialog isOpen={v()} onClose={() => setV(false)}><DialogOverlay /><DialogPanel><DialogTitle>T</DialogTitle><button id="t-x" onClick={() => setV(false)}>x</button></DialogPanel></Dialog></>;
}
