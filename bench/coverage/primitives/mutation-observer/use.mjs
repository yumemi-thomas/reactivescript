import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/mutation-observer", title: "a mutation observer: a tuple's function called in an effect, a callback that writes", ssr: /no change yet/, dom: async (h, page) => {
    await page.click("button");
    h.check("the observer's callback wrote", await h.until(async () => /changes seen/.test(await h.text(page))), await h.text(page));
  } });
