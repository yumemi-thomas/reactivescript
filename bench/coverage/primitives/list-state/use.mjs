import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/list-state", title: "list state: an accessor read, a key handler and a setter called from handlers", ssr: /active: one/, dom: async (h, page) => {
    await page.focus(".list"); await page.keyboard.press("ArrowDown");
    h.check("the keyboard moves the active item", await h.until(async () => /active: two/.test(await h.text(page))), await h.text(page));
    await page.click("button");
    h.check("…and a setter", await h.until(async () => /active: three/.test(await h.text(page))), await h.text(page));
  } });
