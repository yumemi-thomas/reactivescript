import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "terracotta", modules: ["terracotta/switch", "terracotta/disclosure", "terracotta/states"], title: "a switch the app controls", ssr: false, server: "the package ships its source as .jsx, which Node does not load: a server's bundler compiles it",
  dom: async (h, page) => {
    await page.click(".air");
    h.check("the switch writes the app's state", await h.until(async () => /offline/.test(await h.text(page))), await h.text(page));
    h.check("…and shows it", await page.locator(".air[aria-checked=true]").count() === 1, await page.locator("body").innerHTML());
  } });
