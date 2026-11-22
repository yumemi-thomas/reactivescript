import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/event-bus", title: "an event bus: listened to in an effect that returns the disposer, emitted on from a handler", ssr: /heard: nothing yet/, dom: async (h, page) => {
    await page.click("button");
    h.check("the listener heard it", await h.until(async () => /heard: hello/.test(await h.text(page))), await h.text(page));
  } });
