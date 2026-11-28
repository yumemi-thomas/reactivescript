import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: ["@wardic/dom", "@wardic/solid"], title: "presence: an exit animation under <AnimatePresence>", ssr: false, server: "the benchmark imports a package as Node resolves it, and Wardic's server render is its `solid` condition's source, compiled by the app's bundler (compiler/test/wardic.mjs runs it through Vite)", dom: async (h, page) => {
    h.check("shown", await h.until(async () => (await page.locator(".toast").count()) === 1), await h.text(page));
    await page.click("button");
    h.check("…and gone once its exit has run", await h.until(async () => (await page.locator(".toast").count()) === 0), await h.text(page));
  }, pkgs: ["@wardic/solid", "@wardic/dom"], modules: [] });
