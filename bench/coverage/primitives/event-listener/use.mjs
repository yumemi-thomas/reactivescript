import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/event-listener", title: "a listener primitive on an element ref", ssr: /clicked 0/, dom: async (h, page) => {
    await page.click("button");
    h.check("the listener follows the ref and writes", await h.until(async () => /clicked 1/.test(await h.text(page))), await h.text(page));
  } });
