import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/broadcast-channel", title: "a broadcast channel: the last message read, a message posted from a handler", ssr: /silence/, dom: async (h, page) => {
    const [other] = await Promise.all([page.waitForEvent("popup"), page.evaluate(() => { window.open(location.href); })]); await other.waitForFunction(() => window.__mounted);
    await other.click("button");
    h.check("a message posted in another tab is read here", await h.until(async () => /hello from the other tab/.test(await h.text(page))), await h.text(page));
  } });
