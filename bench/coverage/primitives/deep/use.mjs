import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/deep", title: "deep tracking of a source's records, in an effect's input", ssr: /finish/, dom: async (h, page) => {
    await page.click("button");
    h.check("a nested write fires the effect", await h.until(async () => (await page.title()) === "1 done"), await page.title());
  }, pkg: "@solid-primitives/deep" });
