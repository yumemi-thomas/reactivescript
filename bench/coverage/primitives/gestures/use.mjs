import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/gestures", title: "a gesture: a function for an element's ref, with a callback that writes", ssr: /tapped 0/, dom: async (h, page) => {
    await page.mouse.move(40, 30); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up();
    h.check("the tap is heard", await h.until(async () => /tapped 1/.test(await h.text(page))), await h.text(page));
  } });
