import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/virtual", title: "a virtual list component with a render prop", ssr: false, server: "the package ships one build, its JSX compiled for the DOM: <VirtualList> calls a client-only API of @solidjs/web on the server, in any app", dom: async (h, page) => {
    h.check("only the rows in view are rendered", await h.until(async () => { const n = await page.locator(".row").count(); return n > 0 && n < 20; }), await page.locator(".row").count());
    await page.click("button");
    h.check("the empty list shows the fallback's element", await h.until(async () => /no rows/.test(await h.text(page)) && (await page.locator(".row").count()) === 0), await h.text(page));
  } });
