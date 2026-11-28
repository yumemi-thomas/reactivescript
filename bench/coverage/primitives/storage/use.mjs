import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a persisted signal", ssr: /hello anonymous/, dom: async (h, page) => {
    await page.click("button");
    h.check("the setter writes the signal", await h.until(async () => /hello Ada/.test(await h.text(page))), await h.text(page));
    h.check("…and the storage", /Ada/.test(await page.evaluate(() => localStorage.getItem("rx-name") ?? "")), await page.evaluate(() => localStorage.getItem("rx-name")));
  }, pkg: "@solid-primitives/storage", note: "a JS module of the app's own: makePersisted takes a Solid signal (a getter and a setter), and an `.rx` program has none to pass" });
