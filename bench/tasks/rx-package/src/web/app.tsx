// A Solid 2 app in TypeScript that uses the same package: to it, an ordinary Solid library. Its types are the
// package's `.d.ts`; nothing here is checked by ReactiveScript (09 MO-13f).
import { createEffect, createSignal, Errored, Loading, Show } from "solid-js";
import { Badge, Rate, Offline, code, rate, pick, useLabel } from "@bench/rates";
import { createPager, createPages } from "@bench/rates/pager";
import { ThemeProvider } from "@bench/rates/theme";
import { Root, Tag } from "@bench/rates/kit";

// the pager's parts, taken apart once, as a Solid primitive's: each read follows, and none waits for another
function Pager(props: { pages: number }) {
  const { page, quote, set, first, edges, label } = createPager(() => props.pages, 1);
  const [at, go] = createPages(4);                                   // a `ref` parameter given the value
  createEffect(page, n => { (window as unknown as { __pages: number[] }).__pages = [...((window as unknown as { __pages?: number[] }).__pages ?? []), n]; });
  return (
    <p class="pager">
      <b class="page">{page()}</b> <i class="edge">{edges.start() ? "start" : edges.end() ? "end" : "middle"}</i> <i class="label">{label(page())}</i> <i class="first">{first}</i>
      <Errored fallback={err => <u class="quote">{(err() as Error).message}</u>}><Loading fallback={<u class="quote">…</u>}><u class="quote">{quote()}</u></Loading></Errored>
      <button class="set3" onClick={() => set(3)}>3</button>
      <button class="set9" onClick={() => set(9)}>9</button>
      <button class="go" onClick={() => go(9)}>{at()}</button>
    </p>
  );
}

export function App() {
  const [amount, setAmount] = createSignal(2);
  const [shown, setShown] = createSignal(true);
  const label = useLabel(amount);
  return (
    <ThemeProvider accent="teal">
      <header><Badge label={label()} /></header>
      <button class="more" onClick={() => setAmount(a => a + 1)}>more</button>
      <button class="usd" onClick={() => pick("USD")}>USD</button>
      <button class="off" onClick={() => pick("???")}>offline</button>
      <button class="hide" onClick={() => setShown(s => !s)}>toggle</button>
      <Errored fallback={err => <p class="err">{err() instanceof Offline ? `offline: ${(err() as Offline).code}` : "failed"}</p>}>
        <Loading fallback={<p class="wait">asking…</p>}>
          <Show when={shown()}><Rate /></Show>
          <i class="raw">{code()}={rate()}</i>
        </Loading>
      </Errored>
      <Show when={shown()}><Pager pages={amount() + 8} /></Show>
      <aside><Root accent="maroon"><Tag text="root" /></Root></aside>
    </ThemeProvider>
  );
}
