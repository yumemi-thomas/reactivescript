import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/memo", title: "a writable memo: a pure function the library computes with, a setter called from a handler", ssr: /value 2/, dom: async (h, page) => {
    await page.click(".over");
    h.check("written over", await h.until(async () => /value 100/.test(await h.text(page))), await h.text(page));
    await page.click(".base");
    h.check("…and computed again when its source changes", await h.until(async () => /value 10(?!\d)/.test(await h.text(page))), await h.text(page));
  } });
