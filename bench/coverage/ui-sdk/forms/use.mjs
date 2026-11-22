import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@ui-sdk/solid", title: "form controls: a field, an input, a checkbox and a radio group the app controls, a switch, a slider, a segmented control, a button", ssr: false, server: "the package's default build is compiled for the DOM, and its server render is its `solid` condition's source, compiled by the app's bundler; the benchmark imports a package as Node resolves it", dom: async (h, page) => {
    await page.click(".terms");
    h.check("the checkbox's change reaches the app's state", await h.until(async () => /^accepted, standard/.test(await h.text(page, ".state"))), await h.text(page, ".state"));
    await page.click(".express");
    h.check("the radio group's too", await h.until(async () => /accepted, express/.test(await h.text(page, ".state"))), await h.text(page, ".state"));
    await page.click(".airplane");
    h.check("the switch holds its own state", await h.until(async () => (await page.getAttribute(".airplane", "aria-checked")) === "true"), await page.getAttribute(".airplane", "aria-checked"));
    await page.click(".send");
    h.check("the button, enabled by the app's state, is pressed", await h.until(async () => /sent 1/.test(await h.text(page, ".state"))), await h.text(page, ".state"));
  }, pkg: "@ui-sdk/solid", modules: [] });
