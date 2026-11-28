import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a provider and a hook made by a factory: `uses` and `provides` on a module of the app's own", ssr: /count 3/, dom: async (h, page) => {
    await page.click("button");
    h.check("the hook reads the provider above it", await h.until(async () => /count 4/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/context", note: "a JS module of the app's own: the factory given to createContextProvider makes state (a component's body, in a callback), and `.rx` has `context` and `provide` of its own" });
