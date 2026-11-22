import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/selection", title: "the selection as a tuple's accessor", ssr: /selected/, dom: async (h, page) => {
    await page.focus(".field"); await page.evaluate(() => { document.querySelector(".field").setSelectionRange(2, 5); document.dispatchEvent(new Event("selectionchange")); });
    h.check("the selection is followed", await h.until(async () => /selected 2 to 5/.test(await h.text(page))), await h.text(page));
  } });
