import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: ["@wardic/dom", "@wardic/solid"], title: "motion values: a transform of a source, a cycle, a preference", ssr: false, server: "the benchmark imports a package as Node resolves it, and Wardic's server render is its `solid` condition's source, compiled by the app's bundler (compiler/test/wardic.mjs runs it through Vite)", dom: async (h, page) => {
    h.check("the derived value", await h.until(async () => /^25% small/.test(await h.text(page))), await h.text(page));
    await page.click(".more"); await page.click(".size");
    h.check("…follows its source, and the cycle turns", await h.until(async () => /^50% large/.test(await h.text(page))), await h.text(page));
  }, pkgs: ["@wardic/solid", "@wardic/dom"], modules: [] });
