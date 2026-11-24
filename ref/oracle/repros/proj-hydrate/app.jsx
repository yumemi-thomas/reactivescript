import { createStore, createOptimisticStore, Loading } from "solid-js";
export function App(props) {
  const [truth, setTruth] = createStore(async () => await props.ask("rows"), [], { key: "id" });   // the source of truth
  const [view] = createOptimisticStore(() => truth, [], { key: "id" });                          // guesses laid over it
  props.expose({ rename: t => setTruth(d => { d[0].t = t; }) });
  return <Loading fallback={<p>loading</p>}><p>{view.map(r => r.t).join(",")}</p></Loading>;
}
