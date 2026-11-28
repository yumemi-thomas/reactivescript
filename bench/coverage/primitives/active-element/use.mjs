import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/active-element", title: "the focused element as a value", ssr: /focus is on nothing/, dom: async (h, page) => {
    await page.focus(".name");
    h.check("the focused element is followed", await h.until(async () => /focus is on input/.test(await h.text(page))), await h.text(page));
  } });
