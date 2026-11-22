import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/sortable", title: "a sorted view of a source's list", ssr: /Ada ?Grace/, dom: async (h, page) => {
    await page.click("button");
    h.check("the sorted list follows the source", await h.until(async () => /Ada ?Grace ?Alan/.test(await h.text(page))), await h.text(page));
  } });
