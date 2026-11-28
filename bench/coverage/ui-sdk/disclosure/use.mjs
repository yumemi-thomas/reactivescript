import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@ui-sdk/solid", title: "disclosure: an accordion, a collapsible, controlled tabs", ssr: false, server: "the package's default build is compiled for the DOM, and its server render is its `solid` condition's source, compiled by the app's bundler; the benchmark imports a package as Node resolves it", dom: async (h, page) => {
    await page.click(".question");
    h.check("the accordion opens its panel", await h.until(async () => /Standard, express and overnight/.test(await h.text(page))), await h.text(page));
    await page.click(".order");
    h.check("the collapsible opens", await h.until(async () => /Three items/.test(await h.text(page))), await h.text(page));
    await page.click(".password");
    h.check("the tabs' change reaches the app's state, and the panel follows it", await h.until(async () => /Choose a new password/.test(await h.text(page)) && /tab: password/.test(await h.text(page, ".tab"))), await h.text(page));
  }, pkg: "@ui-sdk/solid", modules: [] });
