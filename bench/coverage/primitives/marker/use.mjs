import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a marker: a function the view calls, as a field of a result", ssr: /re\|\[act\]\|ive script/, dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /reactive \|\[script\]/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/marker", note: "a JS module of the app's own: createMarker hands back the function the view calls (io when it is a primitive\'s whole result, MO-10b), and takes a RegExp, which `.rx` has no literal for" });
