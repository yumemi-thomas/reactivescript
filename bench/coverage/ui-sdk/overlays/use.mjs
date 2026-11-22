import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@ui-sdk/solid", title: "overlays: a toast and a confirmation opened from handlers, rendered by the host mounted once", ssr: false, server: "the package's default build is compiled for the DOM, and its server render is its `solid` condition's source, compiled by the app's bundler; the benchmark imports a package as Node resolves it", dom: async (h, page) => {
    await page.click(".save");
    h.check("the toast opened from a handler is rendered by the host", await h.until(async () => /Saved/.test(await h.text(page, "body"))), await h.text(page, "body"));
    await page.click(".ask");
    h.check("the confirmation is rendered by the host", await h.until(async () => /Delete this project\?/.test(await h.text(page, "body"))), await h.text(page, "body"));
    await page.locator("[role=alertdialog] button").last().click();
    h.check("…and its answer comes back to the action that asked", await h.until(async () => /deleted|kept/.test(await h.text(page, ".answer"))), await h.text(page, ".answer"));
  }, pkg: "@ui-sdk/solid", modules: [], note: "the second library `renders(later)` was said to have (09 MO-8r, 2026-11-23): it has not. `toast()` and `confirm()` are given values (a message, a title) and answer an id and a promise; nothing they are given is a component, and nothing they answer is given to the host, which reads a registry of the library's own. The three rows are the draft's, with no word" });
