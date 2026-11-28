import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "an atom, as a reader and a setter", ssr: /count 0/, dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /count 1/.test(await h.text(page))), await h.text(page));
  }, pkg: "solid-use", modules: ["solid-use/atom"], note: "a JS module of the app\'s own: an atom is one function that reads and writes, where a result\'s part is a reader or a function (the utility is its module\'s default export, which an `.rx` module imports as JavaScript does, 09 MO-8u: that is no longer a reason for the module)" });
