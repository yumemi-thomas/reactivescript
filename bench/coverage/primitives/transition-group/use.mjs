import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/transition-group", title: "a switch transition: callbacks called as values enter and leave", ssr: /showing home/, dom: async (h, page) => {
    await page.click("button");
    h.check("the old value leaves and the new one enters", await h.until(async () => /showing about;.*-home.*\+about|showing about;.*\+about.*-home/.test(await h.text(page))), await h.text(page));
  } });
