import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/range", title: "a repeat component, its children narrowed to the render prop the app writes", ssr: /\* ?\* ?\*/, dom: async (h, page) => {
    await page.click("button");
    h.check("repeated again as the count changes", await h.until(async () => (await page.locator("span").count()) === 5), await page.locator("span").count());
  } });
