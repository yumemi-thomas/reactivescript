import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@dschz/solid-flow", modules: ["@dschz/solid-flow"], title: "a graph of two nodes", ssr: false, server: "the package's build is compiled for the DOM",
  dom: async (h, page) => {
    h.check("the nodes are in the page", await h.until(async () => await page.locator(".solid-flow__node").count() === 2), (await page.locator("body").innerHTML()).slice(0, 400));
  } });
