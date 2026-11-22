import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "destructure: a record of accessors, for any shape", ssr: /Ada Lovelace/, dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /Augusta Lovelace/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/destructure", note: "a JS module of the app's own: the result has an accessor for each field of whatever it is given (a mapped type), and a row lists the fields that are `ref`" });
