import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/raf", title: "an animation-frame loop: a tuple of an accessor and two functions, a callback that writes", ssr: /stopped, no frame yet/, dom: async (h, page) => {
    await page.click(".start");
    h.check("started from a handler: frames are counted", await h.until(async () => /running, frames drawn/.test(await h.text(page))), await h.text(page));
    await page.click(".stop");
    h.check("…and stopped", await h.until(async () => /stopped, frames drawn/.test(await h.text(page))), await h.text(page));
  } });
