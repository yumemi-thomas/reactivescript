import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a flux store: state, getters and actions of a result", ssr: /1 doubled is 2/, dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /2 doubled is 4/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/flux-store", note: "a JS module of the app's own: the actions are written over a store\'s setter the library hands a callback, whose own callback is given the draft: two functions deep, where `draft` is said on a callback\'s parameter" });
