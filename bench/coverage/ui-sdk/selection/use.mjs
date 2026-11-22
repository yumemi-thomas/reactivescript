import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@ui-sdk/solid", title: "selection: a controlled select, a listbox", ssr: false, server: "the package's default build is compiled for the DOM, and its server render is its `solid` condition's source, compiled by the app's bundler; the benchmark imports a package as Node resolves it", dom: async (h, page) => {
    await page.click(".role"); await page.click(".editor");
    h.check("the select's change reaches the app's state", await h.until(async () => /role: editor/.test(await h.text(page, ".state"))), await h.text(page, ".state"));
  }, pkg: "@ui-sdk/solid", modules: [] });
