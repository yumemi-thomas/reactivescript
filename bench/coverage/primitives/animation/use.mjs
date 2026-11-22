import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/animation", title: "an animation whose target and keyframes are accessors", ssr: /still/, dom: async (h, page) => {
    await page.click("button");
    h.check("the animation is made when the keyframes arrive", await h.until(async () => /animated/.test(await h.text(page))), await h.text(page));
  } });
