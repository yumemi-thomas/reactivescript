import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "solid-codemirror", title: "an editor made by a ref, that writes the app's text", ssr: /let a = 1/,
  dom: async (h, page) => {
    await page.click(".cm-content"); await page.keyboard.press("End"); await page.keyboard.type("2");
    h.check("what is typed is the app's", await h.until(async () => /let a = 12/.test(await h.text(page, ".copy"))), await page.locator("body").innerHTML());
  } });
