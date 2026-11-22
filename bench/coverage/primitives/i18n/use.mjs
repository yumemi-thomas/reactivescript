import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a translator that follows the locale", ssr: /hello rx/, dom: async (h, page) => {
    await page.click("button");
    h.check("the translator follows the locale", await h.until(async () => /bonjour rx/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/i18n", note: "a JS module of the app's own: `translator(dict)` hands back the function the view calls, and a function that is a primitive\'s whole result is io to `.rx` (MO-10b): the module gives it as a field" });
