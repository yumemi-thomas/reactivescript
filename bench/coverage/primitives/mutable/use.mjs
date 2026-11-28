import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a mutable store: read by the view, changed in place by JavaScript", ssr: /0 in the cart/, dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /1 in the cart/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/mutable", note: "a JS module of the app's own: a mutable is written by assigning to it, and `.rx` writes its own sources (`:=`): the assignment is JavaScript\'s" });
