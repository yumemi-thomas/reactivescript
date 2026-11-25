import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "solid-floating-ui", modules: ["solid-floating-ui", "solid-floating-ui/utils"], title: "an element placed beside another", ssr: false, server: "the package ships its source as .jsx, which Node does not load: a server's bundler compiles it",
  dom: async (h, page) => {
    await page.click(".ref");
    h.check("the note is placed under the button", await h.until(async () => { const a = await page.locator(".ref").boundingBox(), b = await page.locator(".tip").boundingBox().catch(() => null); return !!b && b.y >= a.y + a.height - 1; }), await page.locator("body").innerHTML());
  } });
