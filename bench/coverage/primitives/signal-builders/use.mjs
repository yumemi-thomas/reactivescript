import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "signal builders, behind a row of the app's own", ssr: /total 12/, dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /total 22/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/signal-builders", note: "a JS module of the app's own: each argument is a value or an accessor, in a rest parameter (`...a: MaybeAccessor<number>[]`), where `ref` is said of one parameter" });
