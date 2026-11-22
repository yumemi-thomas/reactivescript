import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: ["@wardic/dom", "@wardic/solid"], title: "motion elements: variants chosen by state, under the provider", ssr: false, server: "the benchmark imports a package as Node resolves it, and Wardic's server render is its `solid` condition's source, compiled by the app's bundler (compiler/test/wardic.mjs runs it through Vite)", dom: async (h, page) => {
    const height = () => page.evaluate(() => Math.round(document.querySelector(".panel").getBoundingClientRect().height));
    h.check("the element starts at its variant", await h.until(async () => (await height()) === 20), await height());
    await page.click(".toggle");
    h.check("…and animates to the other when the state changes", await h.until(async () => (await height()) === 80), await height());
  }, pkgs: ["@wardic/solid", "@wardic/dom"], modules: [] });
