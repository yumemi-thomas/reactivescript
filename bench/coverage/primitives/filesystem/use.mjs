import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/filesystem", title: "a reactive file system: a read in the view, a write from a handler", ssr: /first draft/, dom: async (h, page) => {
    await page.click("button");
    h.check("the read follows the write", await h.until(async () => /second draft/.test(await h.text(page))), await h.text(page));
  } });
