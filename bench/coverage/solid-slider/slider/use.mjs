import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "solid-slider", modules: ["solid-slider"], title: "a carousel and its button, through the library's context", ssr: /one\s*two/, hydration: "the package's server build and its browser build are compiled apart, and number their elements apart",
  dom: async (h, page) => {
    h.check("the slides are in the page", await page.locator(".slide").count() === 2, await page.locator("body").innerHTML());
    await page.click(".next");
    h.check("the button moves it", await h.until(async () => /translate/.test(await page.locator(".slide").nth(1).getAttribute("style") ?? "")), await page.locator("body").innerHTML());
  } });
