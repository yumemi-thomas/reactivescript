import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a singleton root shared by two components", ssr: /0 ?0/, dom: async (h, page) => {
    await page.locator("button").first().click();
    h.check("both components read one state", await h.until(async () => /1 ?1/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/rootless", note: "a JS module of the app's own: createSingletonRoot is called at a module\'s top level with a function that makes state, and hands back the hook" });
