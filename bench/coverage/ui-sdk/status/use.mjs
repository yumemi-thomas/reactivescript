import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@ui-sdk/solid", title: "status: progress and meter over values, an avatar's fallback, a separator", ssr: false, server: "the package's default build is compiled for the DOM, and its server render is its `solid` condition's source, compiled by the app's bundler; the benchmark imports a package as Node resolves it", dom: async (h, page) => {
    h.check("the progress shows its value", await h.until(async () => (await page.getAttribute(".progress", "aria-valuenow")) === "60"), await page.getAttribute(".progress", "aria-valuenow"));
    await page.click("button");
    h.check("…and follows the source", await h.until(async () => (await page.getAttribute(".progress", "aria-valuenow")) === "100"), await page.getAttribute(".progress", "aria-valuenow"));
    h.check("the avatar shows its fallback", /AL/.test(await h.text(page)), await h.text(page));
  }, pkg: "@ui-sdk/solid", modules: [] });
