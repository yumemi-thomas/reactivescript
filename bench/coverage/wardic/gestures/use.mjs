import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: ["@wardic/dom", "@wardic/solid"], title: "gestures: whileHover and whileTap, and a hover sensor read by the view", ssr: false, server: "the benchmark imports a package as Node resolves it, and Wardic's server render is its `solid` condition's source, compiled by the app's bundler (compiler/test/wardic.mjs runs it through Vite)", dom: async (h, page) => {
    await page.mouse.move(300, 300); await page.mouse.move(40, 30);
    h.check("the sensor reads the hover", await h.until(async () => /^hovered/.test(await h.text(page))), await h.text(page));
  }, pkgs: ["@wardic/solid", "@wardic/dom"], modules: [], note: "a JS module of the app's own for the sensor: Wardic's `createHover()` is one function that is given to `ref` and called for its reading, where a result's part is a reader or a function" });
