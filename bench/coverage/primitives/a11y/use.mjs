import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/a11y", title: "the reduced-motion preference, and a live region announced into from a handler", ssr: /full motion, saved 0/, dom: async (h, page) => {
    await page.click("button");
    h.check("the announcement reaches a live region, from a handler", await h.until(async () => /saved 1/.test(await h.text(page)) && (await page.locator("[aria-live]").allTextContents()).join(" ").includes("Saved")), await page.content());
  } });
