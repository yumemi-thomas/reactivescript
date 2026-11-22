import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: ["@wardic/dom", "@wardic/solid"], title: "layout animation: keyed rows in a layout group", ssr: false, server: "the benchmark imports a package as Node resolves it, and Wardic's server render is its `solid` condition's source, compiled by the app's bundler (compiler/test/wardic.mjs runs it through Vite)", dom: async (h, page) => {
    await page.click("button");
    h.check("the rows are reordered", await h.until(async () => /three ?one ?two/.test(await h.text(page, "ul"))), await h.text(page, "ul"));
  }, pkgs: ["@wardic/solid", "@wardic/dom"], modules: [] });
