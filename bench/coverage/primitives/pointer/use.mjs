import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/pointer", title: "the pointer's position", ssr: /0, 0 away/, dom: async (h, page) => {
    await page.mouse.move(200, 300); await page.mouse.move(40, 25);
    h.check("the pointer is followed", await h.until(async () => /40, 25 over the page/.test(await h.text(page))), await h.text(page));
  } });
