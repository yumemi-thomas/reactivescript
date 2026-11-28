import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/favicon", title: "the favicon set from a value", ssr: false, server: "the package's module calls a client-only API of @solidjs/web where it is loaded on the server (`Client-only API called on the server side`), in any app", dom: async (h, page) => {
    const href = () => page.evaluate(() => document.querySelector("link[rel~=icon]")?.getAttribute("href") ?? "");
    h.check("the icon is set", await h.until(async () => /idle\.ico/.test(await href())), await href());
    await page.click("button");
    h.check("…and follows the source", await h.until(async () => /unread\.ico/.test(await href())), await href());
  } });
