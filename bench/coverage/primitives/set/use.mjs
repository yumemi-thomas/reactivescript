import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a reactive Set: the library's class, constructed in a module of the app's own; its methods called", ssr: /1 tags/, dom: async (h, page) => {
    await page.click("button");
    h.check("a method of the library's object, from a handler; its reads follow", await h.until(async () => /2 tags, rx among them/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/set", note: "a JS module of the app's own constructs the class (`new ReactiveSet()`); the package's `createSet` hands back a proxy whose methods lose their `this` (`Cannot read private member`), in any app" });
