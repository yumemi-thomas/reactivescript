import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/analytics", title: "analytics: the library's controls, a count read and an event tracked from a handler", ssr: /0 events waiting/, dom: async (h, page) => {
    await page.click("button");
    h.check("an event tracked from a handler", await h.until(async () => /\d+ events waiting/.test(await h.text(page))), await h.text(page));
  } });
