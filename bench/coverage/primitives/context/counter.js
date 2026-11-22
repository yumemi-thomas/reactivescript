import { createSignal } from "solid-js";
import { createContextProvider } from "@solid-primitives/context";
const [CounterProvider, useCounterContext] = createContextProvider(props => {
  const [count, setCount] = createSignal(props.initial);
  return [count, () => setCount(c => c + 1)];
});
export { CounterProvider };
export const useCounter = () => { const c = useCounterContext(); if (!c) throw new Error("useCounter outside <CounterProvider>"); return c; };
