import { createSignal, Show, For } from "solid-js";
import { Root, Items, Item, Ellipsis, Next, Previous } from "#kobalte/pagination";
export const steps: any = [["click", "#t-n"], ["click", "#t-n"], ["click", "#t-n"], ["click", "#t-n"], ["click", "#t-p"]];
export default function App() {
  
  return <><Root count={10} itemComponent={(p: { page: number }) => <Item page={p.page}>{p.page}</Item>} ellipsisComponent={() => <Ellipsis>…</Ellipsis>}><Previous id="t-p">p</Previous><Items /><Next id="t-n">n</Next></Root></>;
}
