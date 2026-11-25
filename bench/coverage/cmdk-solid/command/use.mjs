import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "cmdk-solid", title: "a command menu, filtered as it is typed in", ssr: false, server: "Kobalte 2, which it is made of, calls a client-only API of @solidjs/web where it is loaded on the server, in any app",
  dom: async (h, page) => {
    await page.fill(".q", "sav");
    h.check("the items are filtered", await h.until(async () => { const t = await h.text(page); return /Save file/.test(t) && await page.locator("[cmdk-item]:visible", { hasText: "Open file" }).count() === 0; }), await page.locator("body").innerHTML());
    await page.keyboard.press("Enter");
    h.check("the item picked runs", await h.until(async () => /ran save/.test(await h.text(page))), await h.text(page));
  } });
