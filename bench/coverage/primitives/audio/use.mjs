import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/audio", title: "an audio player: accessors of a result, and its setters", ssr: /paused, volume/, dom: async (h, page) => {
    await page.click("button");
    h.check("a setter of the result, from a handler", await h.until(async () => /volume 0.5/.test(await h.text(page))), await h.text(page));
  } });
