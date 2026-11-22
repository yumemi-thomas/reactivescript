import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/input-mask", title: "an input mask: a function the primitive hands back, called from the element's handler", ssr: /^$/, dom: async (h, page) => {
    await page.focus(".date"); await page.keyboard.type("01022026");
    h.check("the handler formats what is typed", await h.until(async () => (await page.inputValue(".date")) === "01/02/2026"), await page.inputValue(".date"));
  } });
