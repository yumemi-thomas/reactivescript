import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/event-props", title: "event props spread on an element, and a store of the last events", note: "the library's props are lowercase (`onpointerdown`): spread on an element, Solid 2 sets them as attributes (LOWERCASE_EVENT_ATTRIBUTE), in any app; the program gives each to the element's own handler", ssr: /not pressed yet/, dom: async (h, page) => {
    await page.click("button");
    h.check("the library's handler, given to the element's own, records the event", await h.until(async () => /^pressed/.test(await h.text(page))), await h.text(page));
  } });
