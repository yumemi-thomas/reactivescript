import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/keyed", title: "a keyed list component: a render prop given accessors", ssr: /1. Ada ?2. Grace/, hydration: "<Key> renders its rows by another path on the server (`if (isServer)`, index.js:20) than in the browser, so the rows' hydration keys differ: the library's, in any app", dom: async (h, page) => {
    await page.click("button");
    h.check("a row is added under its key", await h.until(async () => /3. Alan/.test(await h.text(page))), await h.text(page));
    await page.click("#clear");
    h.check("the empty list shows the fallback's element", await h.until(async () => /nobody yet/.test(await h.text(page)) && !/Ada/.test(await h.text(page))), await h.text(page));
  } });
