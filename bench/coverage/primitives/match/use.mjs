import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/match", title: "a match component whose cases are functions in a record", ssr: /ready when you are/, dom: async (h, page) => {
    await page.click("button");
    h.check("the case follows the value", await h.until(async () => /working on it/.test(await h.text(page))), await h.text(page));
  } });
