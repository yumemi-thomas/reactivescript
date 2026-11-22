import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/async", title: "an abort signal and the functions that abort it", ssr: /idle/, dom: async (h, page) => {
    await page.click(".start");
    h.check("the signal is read in a handler", await h.until(async () => /running/.test(await h.text(page))), await h.text(page));
    await page.click(".stop");
    h.check("…and aborted from one", await h.until(async () => /stopped/.test(await h.text(page))), await h.text(page));
  } });
