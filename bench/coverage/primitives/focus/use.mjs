import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/focus", title: "a focus listener added in an effect that returns its disposer", ssr: /not editing/, dom: async (h, page) => {
    await page.focus(".field");
    h.check("focus is heard", await h.until(async () => /^editing/.test(await h.text(page))), await h.text(page));
  } });
