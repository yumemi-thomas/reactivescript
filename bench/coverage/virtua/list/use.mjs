import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "virtua", modules: ["virtua/solid"], title: "a virtual list, its rows by a render prop", ssr: false, server: "the package's build for Solid is compiled for the DOM alone: it calls a client-only API of @solidjs/web where it is loaded on the server, in any app",
  dom: async (h, page) => {
    h.check("some rows are in the page, and not all", await h.until(async () => { const n = await page.locator(".row").count(); return n > 5 && n < 200; }), await page.locator(".row").count());
    await page.locator(".row", { hasText: /^row 3$/ }).click();
    h.check("a row's own handler", await h.until(async () => /picked row 3/.test(await h.text(page))), await h.text(page));
  } });
