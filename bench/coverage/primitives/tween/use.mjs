import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/tween", title: "a tween that follows a source", ssr: /at 0/, dom: async (h, page) => {
    await page.click("button");
    h.check("the value eases to the target", await h.until(async () => /at 100$/.test((await h.text(page)).replace("go", ""))), await h.text(page));
  } });
