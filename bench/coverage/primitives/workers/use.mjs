import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a worker's function, awaited in an action", ssr: false, server: "a worker is the browser's (`new Worker`)", dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /answer 144/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/workers", note: "a JS module of the app's own: createWorker is given functions (their source is sent to the worker) and hands back a tuple whose first part has a method for each: a mapped type" });
