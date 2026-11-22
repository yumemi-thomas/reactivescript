import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/intersection-observer", title: "an element's visibility on a ref", ssr: /measuring|out of view/, hydration: "the value is ready on the server and waits in the browser until the observer first reports: the server's page has the view where the browser's first render has the fallback, in any app", dom: async (h, page) => {
    await page.evaluate(() => document.querySelector(".target").scrollIntoView());
    h.check("scrolled into view", await h.until(async () => /^in view/.test(await h.text(page))), await h.text(page));
  } });
