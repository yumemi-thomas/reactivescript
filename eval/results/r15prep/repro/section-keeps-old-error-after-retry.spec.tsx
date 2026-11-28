/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// desk9 (eval/reference/desk9/rx): an issue's detail fails (not found) and is retried. Its answer comes, and the
// detail shows it, but a section under it (a search for the issue's title, under its own Loading and Errored) shows
// the detail's old error instead of loading. Needs a Show reading the section's async memo inside its Errored (a
// plain text read of it shows "finding"). Passes on next 0f6a97864; fails from eb31c8665 (#4908).
import { test, expect } from "vitest";
import { Errored, Loading, Show, createMemo, createSignal, flush, refresh } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };

test("a retried detail shows, and the section under it doesn't keep the detail's old error", async () => {
  const fl: Record<string, ((v: any) => void)[]> = {};
  const ask = (k: string) => new Promise<any>(r => (fl[k] ??= []).push(r));
  const land = (k: string, v: any) => { const rs = fl[k] ?? []; if (!rs.length) throw new Error("no ask " + k); fl[k] = []; rs.forEach(r => r(structuredClone(v))); };
  const c = document.body.appendChild(document.createElement("div"));

  function Related(props: { title: string }) {
    const hits = createMemo(() => ask("search:" + props.title));
    return <Loading fallback={<p>finding related help</p>}>
      <Errored fallback={(e: any) => <p>related help failed: {e().message}</p>}>
        <Show when={(hits() as any).length === 0} fallback={<p>some related help</p>}><p>no related help</p></Show>
      </Errored>
    </Loading>;
  }
  const [selected] = createSignal(3);
  const detail = createMemo(async () => { const id = selected(); const d: any = await ask("issue:" + id); if (d == null) throw new Error(`issue #${id} not found`); return d; });
  render(() => <Loading on={selected()} fallback={<p>loading</p>}>
    <Errored fallback={(e: any) => <p>detail error: {e().message}</p>}><p>{detail().body}</p><Related title={detail().title} /></Errored>
  </Loading>, c);

  await tick();
  land("issue:3", null); await tick();
  expect(c.textContent).toBe("detail error: issue #3 not found");
  refresh(detail); await tick();                                       // retry
  land("issue:3", { id: 3, title: "Crash", body: "trace" }); await tick();
  expect(c.textContent).toBe("tracefinding related help");             // got "tracerelated help failed: issue #3 not found"
});
