// A Solid 2 app in TypeScript that uses the same package: to it, an ordinary Solid library. Its types are the
// package's `.d.ts`; nothing here is checked by ReactiveScript (09 MO-13f).
import { createSignal, Errored, Loading, Show } from "solid-js";
import { Badge, Rate, Offline, code, rate, pick, useLabel } from "@bench/rates";
import { ThemeProvider } from "@bench/rates/theme";

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
    </ThemeProvider>
  );
}
