// Toasts on Kobalte 2 (@kobalte/core 2.0.0-alpha.5): a toast is a component the app hands the toaster from a handler,
// and the library renders it later, in its list, wherever the app put that (09 MO-11u). Kobalte left the suite on
// 2026-11-22 and is back with the task it was missed for: its toaster is one of the three libraries of Solid 2 —
// with solid-sonner and TanStack Router's code-based routes — whose rows say `renders(<Component>)`, and the bar a
// word is held to counts the ecosystem's releases, pre-releases included (09 MO-8r).
// The toaster is Kobalte's own object: `toaster.show` is a method, and a method has a row of its own since 2026-11-25
// (09 MO-8t). Until then it was behind a module of the app's own (src/toasts.js), which is gone; the declaration is the
// rows the app uses of rx-declare's draft of the package, no word by hand.
import { spawnSync } from "node:child_process";
import path from "node:path";
export default {
  title: "Kobalte toasts: a toast component shown from a handler, rendered by the list under the app's context and the library's region",
  types: [
    { name: "the toaster takes a toast component, not a message", edit: ["shown := toaster.show(Saved)", 'shown := toaster.show("saved")'], expect: /TS2345/ },
    { name: "a toast's id is the number the toaster gave it", edit: ['<Toast toastId={props.toastId} class="toast">\n    <Toast.Title><b', '<Toast toastId={"1"} class="toast">\n    <Toast.Title><b'], expect: /TS2322/ },
    { name: "what the app's server answers keeps its type in the toast", edit: ["{sent} changes synced", "{sent.length} changes synced"], expect: /TS2339/ },
  ],
  bad: [
    { name: "a toast written in the view, outside any region", edit: ["    <Editor />\n", "    <Editor />\n    <Saved toastId={0} />\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "a toast's close button written beside the toast, not in it", edit: ['    <Toast.CloseButton class="close">dismiss</Toast.CloseButton>\n  </Toast>\n', '  </Toast>\n  <Toast.CloseButton class="close">dismiss</Toast.CloseButton>\n'], expect: "CONTEXT_NOT_FOUND" },
    { name: "the list outside its region", edit: ['<Toast.Region><Toast.List class="toasts" /></Toast.Region>', '<Toast.List class="toasts" />'], expect: "CONTEXT_NOT_FOUND" },
    { name: "the app's context provided beside the list, not above it", edit: ["    <Toasts />\n  </Themed>\n", "  </Themed>\n  <Toasts />\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "a toast whose question can fail, with no errored region above the list", edit: ['errored fallback(e: Offline) { <p class="lost">offline</p> } { <Toast.Region><Toast.List class="toasts" /></Toast.Region> }', '<Toast.Region><Toast.List class="toasts" /></Toast.Region>'], expect: "UNHANDLED_FAILURE" },
    { name: "the row without the word: a toast under a root of its own reads nothing from above", file: "rx-types/@kobalte/core/toast.d.rx", edit: [" renders(Toast.List)", ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "a toast shown while the view computes", edit: ['<p class="last">last toast {shown}</p>', '<p class="last">last toast {toaster.show(Saved)}</p>'], expect: "IO_IN_REACTIVE" },
    { name: "the toasts cleared while the view computes (a method with a row, io)", edit: ['<p class="last">last toast {shown}</p>', '<p class="last">last toast {shown}{toaster.clear()}</p>'], expect: "IO_IN_REACTIVE" },
    { name: "a method called where the handler is given", edit: ["onClick={() => { toaster.clear() }}", "onClick={toaster.clear()}"], expect: "IO_IN_REACTIVE" },
    { name: "a toast dismissed by an equation: the method answers a number, and its row says io", edit: ["component Editor() {\n", "component Editor() {\n  gone = toaster.dismiss(shown)\n"], expect: "IO_IN_REACTIVE" },
    { name: "the toaster's name bound again by a declaration (a loop's variable or a parameter of the name is another binding, and fine)", edit: ["component Editor() {\n", "component Editor() {\n  toaster = { clear: () => 1 }\n"], expect: "SHADOWED_IMPORT" },
    { name: "the toast's component called where it is handed over", edit: ["shown := toaster.show(Saved)", "shown := toaster.show(Saved({ toastId: 0 }))"], expect: "COMPONENT_AS_VALUE" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("no toast until one is shown", await page.locator(".toasts .toast").count() === 0, await h.text(page, "body"));
    await page.click(".save");
    h.check("a toast shown from a handler is rendered by the list, in the region", await h.until(async () => await page.locator(".toasts .toast").count() === 1 && /saved/.test(await h.text(page, ".toasts"))), await h.text(page, "body"));
    h.check("the toast reads the app's context, provided above the list", await page.locator(".toasts .toast b.dark").count() === 1, await page.locator(".toasts").innerHTML().catch(() => ""));
    await page.click(".sync");
    h.check("a toast that asks first: its own region shows while it waits, then the answer", await h.until(async () => /3 changes synced/.test(await h.text(page, ".toasts"))), await h.text(page, "body"));
    h.check("two toasts, each with the id the toaster gave it", await page.locator(".toasts .toast").count() === 2, await h.text(page, "body"));
    await page.locator(".toasts .toast .close").first().click();
    h.check("a toast dismissed by Kobalte's close button leaves the list", await h.until(async () => await page.locator(".toasts .toast").count() === 1 && !/saved/.test(await h.text(page, ".toasts"))), await h.text(page, "body"));
    await page.click(".clear");
    h.check("the toaster's own method from a handler: the list is cleared", await h.until(async () => await page.locator(".toasts .toast").count() === 0), await h.text(page, "body"));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
    // the declaration itself, run: rx-verify renders the probe's scene (rx-types/@kobalte/core/toast.probe.mjs) against Kobalte, and holds each
    // word of it to what the library does
    const v = spawnSync(process.execPath, ["--conditions=browser", path.join(h.dir, "../../node_modules/@reactivescript/language-server/bin/verify.js"), "--dom", "rx-types/@kobalte/core/toast.d.rx"], { cwd: h.dir, encoding: "utf8" });
    h.check("rx-verify: `renders(Toast.List)` holds where Kobalte is run — the toast renders beneath the list", /toast\.d\.rx:\d+ held\s+toaster\.show: placement holds: Saved beneath Toast\.List/.test(v.stdout) && !/MISMATCH/.test(v.stdout), v.stdout + v.stderr);
    h.check("rx-verify: so do the contexts — the region's, read by the list and a toast; the toast's, read by its parts", ["Toast\\.Region: provides\\(toastRegion\\) holds", "Toast: provides\\(toast\\) holds", "Toast: uses\\(toastRegion\\) holds", "Toast\\.List: uses\\(toastRegion\\) holds", "Toast\\.Title: uses\\(toast\\) holds", "Toast\\.CloseButton: uses\\(toast\\) holds"].every(x => new RegExp(x).test(v.stdout)), v.stdout + v.stderr);
  },
};
