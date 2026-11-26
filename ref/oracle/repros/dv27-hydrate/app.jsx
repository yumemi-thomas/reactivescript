import { createSignal, createStore } from "solid-js";
export function App(props) {
  const [els, setEls] = createStore([0]);
  const [list, setList] = createSignal([0]);
  const [n, setN] = createSignal(0);
  props.expose({ push: () => setEls(d => { d.push(9); }) });
  // each `ref` writes as its element is made: a store, a signal holding an array, a number
  return <div>
    <i ref={() => { setEls(d => { d.push(1); }); setList(l => [...l, 1]); setN(5); }}>a</i>
    <p>{els.length}/{list().length}/{n()}</p>
  </div>;
}
