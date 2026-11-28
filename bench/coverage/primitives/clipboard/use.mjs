import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/clipboard", title: "the clipboard written by an action that awaits it", ssr: /ready/, dom: async (h, page) => {
    await page.click("button");
    h.check("the action awaited the write", await h.until(async () => /copied/.test(await h.text(page))), await h.text(page));
    h.check("the clipboard holds the text", (await page.evaluate(() => navigator.clipboard.readText())) === "copied by rx", await page.evaluate(() => navigator.clipboard.readText()));
  }, before: async page => { await page.context().grantPermissions(["clipboard-read", "clipboard-write"]); } });
