import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/sortable", title: "a sorted view of a source's list", ssr: /Ada ?Grace/, dom: async (h, page) => {
    await page.click("button");
    h.check("the sorted list follows the source", await h.until(async () => /Ada ?Grace ?Alan/.test(await h.text(page))), await h.text(page));
  }, note: "a JS module of the app's own (sorted.js): createSorted sorts the list it is given in place when asked (`{ dirty: true }`), so its row is not `pure` — it was, by hand, until rx-declare --audit read the code (09 MO-8w) — and the wrapper, which never asks, is read as `pure`",
  bad: [{ name: "the library's createSorted declared `pure`, as it was by hand: it sorts the list it is given in place when asked", file: "rx-types/@solid-primitives/sortable.d.rx", edit: ["export fn createSorted<T>(", "export pure fn createSorted<T>("], verify: ["rx-types/@solid-primitives/sortable.d.rx", /createSorted: declared pure, but when it is called it changes what it is given \(\[3,1,2\] to \[1,2,3\]\)/] }] });
