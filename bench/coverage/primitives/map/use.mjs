import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a reactive Map: the library's class, constructed in a module of the app's own; its methods called", ssr: /solid has 1/, dom: async (h, page) => {
    await page.click("button");
    h.check("a method of the library's object, from a handler; its reads follow", await h.until(async () => /solid has 2/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/map", note: "a JS module of the app's own constructs the class (`new ReactiveMap()`); the package's `createMap` hands back a proxy whose methods lose their `this` (`Cannot read private member`), in any app" });
