import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/interaction", title: "interact-outside on an element ref", ssr: /closed 0/, dom: async (h, page) => {
    await page.click(".elsewhere");
    h.check("a press outside is heard", await h.until(async () => /closed [12]/.test(await h.text(page))), await h.text(page));
  } });
