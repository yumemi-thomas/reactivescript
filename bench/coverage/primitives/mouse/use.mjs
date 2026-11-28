import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/mouse", title: "the mouse position as a store's fields", ssr: /0, 0/, dom: async (h, page) => {
    await page.mouse.move(30, 40);
    h.check("the position is followed", await h.until(async () => /30, 40/.test(await h.text(page))), await h.text(page));
  } });
