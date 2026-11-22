import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/promise", title: "a promise helper awaited in an action", ssr: /ready/, dom: async (h, page) => {
    await page.click("button");
    h.check("awaited, and the action went on", await h.until(async () => /done/.test(await h.text(page))), await h.text(page));
  } });
