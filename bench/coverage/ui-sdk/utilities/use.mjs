import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@ui-sdk/solid", modules: [], title: "utilities: number and date helpers as pure functions", ssr: false, server: "the package's default build is compiled for the DOM, and its server render is its `solid` condition's source, compiled by the app's bundler; the benchmark imports a package as Node resolves it", dom: async (h, page) => {
    h.check("computed", /3 of 10/.test(await h.text(page, ".n")) && /2026|Feb/.test(await h.text(page, ".d")), await h.text(page));
    await page.click("button");
    h.check("…and computed again as the sources change", await h.until(async () => /10 of 10/.test(await h.text(page, ".n"))), await h.text(page));
  }, pkg: "@ui-sdk/solid",  });
