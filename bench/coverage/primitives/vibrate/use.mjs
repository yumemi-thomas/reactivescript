import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/vibrate", title: "a vibration whose pattern follows a value; start and stop are a result's functions", ssr: /still/, dom: async (h, page) => {
    await page.click(".go");
    h.check("started from a handler", await h.until(async () => /buzzing|still/.test(await h.text(page))), await h.text(page));
    await page.click(".stop");
    h.check("…and stopped", await h.until(async () => /still/.test(await h.text(page))), await h.text(page));
  } });
