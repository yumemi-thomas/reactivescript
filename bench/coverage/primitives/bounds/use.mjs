import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/bounds", title: "an element's bounds on a ref", ssr: /0 by 0/, dom: async (h, page) => {
    h.check("the element's bounds are measured", await h.until(async () => /120 by 40/.test(await h.text(page))), await h.text(page));
    await page.evaluate(() => { document.querySelector(".box").style.width = "200px"; });
    h.check("…and followed as it is resized", await h.until(async () => /200 by 40/.test(await h.text(page))), await h.text(page));
  } });
