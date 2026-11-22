import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "undo history over a source", ssr: /^a/, dom: async (h, page) => {
    await page.click(".type");
    h.check("a change is recorded", await h.until(async () => /ab \(can undo\)/.test(await h.text(page))), await h.text(page));
    await page.click(".undo");
    h.check("…and undone by the library calling back", await h.until(async () => /^a(?!b)/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/history", note: "a JS module of the app's own: the library takes one function that is tracked and answers a function that writes" });
