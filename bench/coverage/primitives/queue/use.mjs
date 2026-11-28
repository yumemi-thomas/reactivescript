import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/queue", title: "a queue: accessors of a result, and its functions (one drafted an accessor, by its type)", ssr: /1 waiting, next: first/, dom: async (h, page) => {
    await page.click(".add");
    h.check("added from a handler", await h.until(async () => /2 waiting, next: first/.test(await h.text(page))), await h.text(page));
    await page.click(".take");
    h.check("…and taken", await h.until(async () => /1 waiting, next: second/.test(await h.text(page))), await h.text(page));
  } });
