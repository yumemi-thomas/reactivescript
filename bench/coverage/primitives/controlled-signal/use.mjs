import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/controlled-signal", title: "a controllable signal: accessors in a record of options, a change callback that writes", ssr: /value 1, changed 0/, dom: async (h, page) => {
    await page.click("button");
    h.check("set from a handler; the change callback wrote", await h.until(async () => /value 7, changed 1/.test(await h.text(page))), await h.text(page));
  } });
