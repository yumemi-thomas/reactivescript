import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/connectivity", title: "the network's state as a value", ssr: /online/, dom: async (h, page) => {
    await page.context().setOffline(true);
    h.check("going offline is heard", await h.until(async () => /offline/.test(await h.text(page))), await h.text(page));
    await page.context().setOffline(false);
    h.check("…and coming back", await h.until(async () => /online/.test(await h.text(page))), await h.text(page));
  } });
