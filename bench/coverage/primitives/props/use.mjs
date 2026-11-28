import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "combined props, in a component of the app's own JavaScript", ssr: false, server: "button.js makes its element with the DOM", dom: async (h, page) => {
    h.check("the classes are combined", /button primary|primary button/.test(await page.getAttribute("button", "class") ?? ""), await page.getAttribute("button", "class"));
    await page.click("button");
    h.check("the handler is reached", await h.until(async () => /pressed 1/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/props", note: "a JS module of the app's own: combineProps is for a component that spreads props it merges onto its own element: a component author\'s tool, in a component written in JavaScript" });
