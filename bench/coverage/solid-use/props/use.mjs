import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "solid-use", modules: ["solid-use/props"], title: "props helpers: a pure function over a source's record", ssr: /Ada, born 1815/, dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /Ada Lovelace, born 1815/.test(await h.text(page))), await h.text(page));
  } });
