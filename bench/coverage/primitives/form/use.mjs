import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/form", title: "a form: accessors of a result, a field's setter called from a handler", ssr: /untouched/, dom: async (h, page) => {
    await page.fill(".name", "Ada");
    h.check("the form is dirty once a field is set", await h.until(async () => /edited/.test(await h.text(page))), await h.text(page));
  } });
