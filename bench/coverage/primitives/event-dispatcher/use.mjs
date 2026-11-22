import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/event-dispatcher", title: "a dispatcher over a component's own props", ssr: /picked 0/, dom: async (h, page) => {
    await page.click("button");
    h.check("the parent's handler is given the event", await h.until(async () => /picked 4/.test(await h.text(page))), await h.text(page));
  } });
