import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: ["@wardic/dom", "@wardic/solid"], title: "easing: a pure function, lifted over a source and given to a transition", ssr: false, server: "the benchmark imports a package as Node resolves it, and Wardic's server render is its `solid` condition's source, compiled by the app's bundler (compiler/test/wardic.mjs runs it through Vite)", dom: async (h, page) => {
    h.check("eased at the middle", await h.until(async () => /eased 0.5/.test(await h.text(page))), await h.text(page));
    await page.click("button");
    h.check("…and at the end", await h.until(async () => /eased 1(?!\d)/.test(await h.text(page))), await h.text(page));
  }, pkgs: ["@wardic/solid", "@wardic/dom"], modules: [] });
