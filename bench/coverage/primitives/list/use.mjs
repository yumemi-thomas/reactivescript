import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/list", title: "a list component with a render prop of accessors", ssr: /1. Ada ?2. Grace/, dom: async (h, page) => {
    await page.click("button");
    h.check("a row is added", await h.until(async () => /3. Alan/.test(await h.text(page))), await h.text(page));
  } });
