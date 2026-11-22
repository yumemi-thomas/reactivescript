import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@ui-sdk/solid", title: "popups: a popover, a menu whose item tells the app, a tooltip", ssr: false, server: "the package's default build is compiled for the DOM, and its server render is its `solid` condition's source, compiled by the app's bundler; the benchmark imports a package as Node resolves it", dom: async (h, page) => {
    await page.click(".share");
    h.check("the popover opens", await h.until(async () => /Anyone with the link can view it/.test(await page.textContent("body"))), await page.textContent("body"));
    await page.click(".cancel");
    await page.click(".actions"); await page.click(".rename");
    h.check("the menu item's selection reaches the app's state", await h.until(async () => /picked rename/.test(await h.text(page, ".picked"))), await h.text(page, ".picked"));
  }, pkg: "@ui-sdk/solid", modules: [] });
