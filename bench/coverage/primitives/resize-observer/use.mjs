import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/resize-observer", title: "the window's size as a store's fields", ssr: /0 by 0/, dom: async (h, page) => {
    h.check("the window is measured", await h.until(async () => /1280 by 720/.test(await h.text(page))), await h.text(page));
    await page.setViewportSize({ width: 800, height: 600 });
    h.check("…and followed", await h.until(async () => /800 by 600/.test(await h.text(page))), await h.text(page));
  } });
