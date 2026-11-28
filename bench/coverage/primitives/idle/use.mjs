import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/idle", title: "an idle timer: its states read, a callback it calls later", ssr: /active, woke 0/, dom: async (h, page) => {
    h.check("the user goes idle", await h.until(async () => /^idle, woke 0/.test(await h.text(page))), await h.text(page));
    await page.mouse.move(10, 10); await page.mouse.move(20, 20);
    h.check("…and is back: the handler wrote", await h.until(async () => /^active, woke 1/.test(await h.text(page))), await h.text(page));
  } });
