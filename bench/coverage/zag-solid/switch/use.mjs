import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@zag-js/solid", title: "a machine run by a component", ssr: /online/,
  dom: async (h, page) => {
    await page.click(".air");
    h.check("the machine's state is shown", await h.until(async () => /offline/.test(await h.text(page))), await h.text(page));
  } });
