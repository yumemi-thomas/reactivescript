import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@xstate/solid", title: "a machine run by a component", ssr: /off/,
  dom: async (h, page) => {
    await page.click(".flip");
    h.check("an event changes the state shown", await h.until(async () => /\bon\b/.test(await h.text(page, "p"))), await h.text(page));
  } });
