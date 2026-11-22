import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "an atom, as a reader and a setter", ssr: /count 0/, dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /count 1/.test(await h.text(page))), await h.text(page));
  }, pkg: "solid-use", modules: ["solid-use/atom"], note: "a JS module of the app's own: the utility is the module\'s default export, and a `.d.rx` declares named exports; and an atom is one function that reads and writes, where a result\'s part is a reader or a function" });
