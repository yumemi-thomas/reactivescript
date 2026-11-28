import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a trigger, behind a reader and a function", ssr: /version 0/, dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /version 1/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/trigger", note: "a JS module of the app's own: `track()` answers nothing and is called where a value is computed: to `.rx` a function that answers nothing is called for what it does (MO-10b)" });
