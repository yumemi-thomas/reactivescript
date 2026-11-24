import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@ui-sdk/solid", title: "overlays: a toast and a confirmation opened from handlers, rendered by the host mounted once", ssr: false, server: "the package's default build is compiled for the DOM, and its server render is its `solid` condition's source, compiled by the app's bundler; the benchmark imports a package as Node resolves it", dom: async (h, page) => {
    // what the host shows is its toasts' own elements, not the page's text: the library also says each toast to a screen
    // reader, 200 ms after it opens, in an element of `body` it never empties (@ui-sdk/core, foundation/platform/announce.js)
    // — on a machine slow enough for that to come before the click on `clear`, a page whose toasts are gone still had their text
    const toasts = async () => (await page.locator("section > ol > li").allTextContents()).join(" | ");
    await page.click(".save");
    h.check("the toast opened from a handler is rendered by the host", await h.until(async () => /Saved/.test(await toasts())), await toasts());
    await page.click(".done");
    h.check("a toast opened by the toaster's method, from a handler", await h.until(async () => /Exported/.test(await toasts())), await toasts());
    await page.click(".clear");
    h.check("…and the toasts dismissed by another", await h.until(async () => await toasts() === ""), await toasts());
    await page.click(".ask");
    h.check("the confirmation is rendered by the host", await h.until(async () => /Delete this project\?/.test(await h.text(page, "body"))), await h.text(page, "body"));
    await page.locator("[role=alertdialog] button").last().click();
    h.check("…and its answer comes back to the action that asked", await h.until(async () => /deleted|kept/.test(await h.text(page, ".answer"))), await h.text(page, ".answer"));
  },
  bad: [
    { name: "a toast shown while the view computes: the method's row says io", edit: ['  <p class="answer">{answer}</p>', '  <p class="answer">{answer}{toast.success("Exported")}</p>'], expect: "IO_IN_REACTIVE" },
    { name: "the toaster's method called where the handler is given", edit: ['onClick={() => { toast.dismiss() }}', "onClick={toast.dismiss()}"], expect: "IO_IN_REACTIVE" },
    { name: "a toast shown by an equation", edit: ['  source answer := "not asked"\n', '  source answer := "not asked"\n  shown = toast.success(answer)\n'], expect: "IO_IN_REACTIVE" },
  ],
  pkg: "@ui-sdk/solid", modules: [], note: "one of the libraries whose API is an object's methods (09 MO-8t): `toast.success()` and `toast.dismiss()` have rows of their own, the draft's. Until 2026-11-25 a method was read by what its type answers, and `toast.success(…)` answers an id: it was accepted in a view, where it shows a toast on every computation (run). It is not the second library `renders(later)` was said to have (09 MO-8r, 2026-11-23): that word was withdrawn, and it has none: `toast()` and `confirm()` are given values (a message, a title) and answer an id and a promise; nothing they are given is a component, and nothing they answer is given to the host, which reads a registry of the library's own. The three rows are the draft's, with no word" });
