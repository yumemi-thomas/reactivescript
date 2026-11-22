// What state.rx's `stamp` is: the number of the module instance that made it, which says when that instance is disposed.
import { onCleanup } from "solid-js";
const g = (globalThis.__probe ??= { made: 0, disposed: [] });
export const mark = () => { const id = ++g.made; onCleanup(() => g.disposed.push(id)); return id; };
