import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "solid-tiptap", title: "an editor over an element of the app's", ssr: false, server: "Tiptap makes its editor of an element of the page",
  dom: async (h, page) => {
    h.check("the document is the app's", await h.until(async () => /<p>hello<\/p>/.test(await h.text(page, ".html"))), await page.locator("body").innerHTML());
    await page.click(".doc p"); await page.keyboard.press("End"); await page.keyboard.type("!");
    h.check("…and follows what is typed", await h.until(async () => /<p>hello!<\/p>/.test(await h.text(page, ".html"))), await h.text(page, ".html"));
  } });
