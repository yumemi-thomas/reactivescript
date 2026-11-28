import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a reactive string, behind a row of the app's own", ssr: /Hello Ada!/, dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /Hello Grace!/.test(await h.text(page))), await h.text(page));
  }, pkg: "solid-use", modules: ["solid-use/string"], note: "a JS module of the app's own: it is a tagged template, which `.rx` has no call for (the utility is its module\'s default export, which an `.rx` module imports as JavaScript does, 09 MO-8u: no longer a reason for the module)" });
