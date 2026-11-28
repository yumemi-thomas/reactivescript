import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/keyboard", title: "the keys held as a list, and a shortcut whose callback writes", ssr: /held: none; saved 0/, dom: async (h, page) => {
    await page.keyboard.down("Control"); await page.keyboard.down("s");
    h.check("the shortcut's callback wrote, and the held keys are listed", await h.until(async () => /held: CONTROL\+S; saved 1/.test(await h.text(page))), await h.text(page));
    await page.keyboard.up("s"); await page.keyboard.up("Control");
    h.check("…and released", await h.until(async () => /held: none; saved 1/.test(await h.text(page))), await h.text(page));
  } });
