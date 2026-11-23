import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "solid-marked", modules: ["solid-marked", "solid-marked/component"], title: "Markdown rendered through a record of the app's components, under the app's context",
  ssr: /Field notes\s*written in\s*markdown/,
  dom: async (h, page) => {
    h.check("each node is rendered by the component given for its kind", await h.until(async () => await page.locator("article.doc h2#field-notes").count() === 1 && await page.locator("article.doc p.para strong").count() === 1), await page.locator("body").innerHTML().catch(() => ""));
    h.check("…beneath <Markdown>: the heading reads the context provided above it", await page.locator("h2.dark").count() === 1, await page.locator("body").innerHTML().catch(() => ""));
    await page.click(".edit");
    h.check("the source is parsed again when it changes", await h.until(async () => /edited\s*twice/.test(await h.text(page))), await h.text(page));
  },
  bad: [
    { name: "the context provided beside <Markdown>, not above it", edit: ["  <Themed>\n    <Markdown builtins={{ Root: Page, Heading: Heading, Paragraph: Paragraph, Strong: Strong }}>{text}</Markdown>\n  </Themed>\n", "  <Themed><p>themed</p></Themed>\n  <Markdown builtins={{ Root: Page, Heading: Heading, Paragraph: Paragraph, Strong: Strong }}>{text}</Markdown>\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "the record of components built outside the prop: a value nothing renders", edit: ["  <Themed>\n    <Markdown builtins={{ Root: Page, Heading: Heading, Paragraph: Paragraph, Strong: Strong }}>", "  parts = { Root: Page, Heading: Heading, Paragraph: Paragraph, Strong: Strong }\n  <Themed>\n    <Markdown builtins={parts}>"], expect: "COMPONENT_AS_VALUE" },
  ],
  note: "the runtime component is its module's default export, handed out by name from a module of the app's own (markdown.js); its row is the draft's. A component in a record given to a prop is read as a direct one is (09 MO-11c, 2026-11-24): it was `COMPONENT_AS_VALUE`. `solid-marked/compiler` is the build-time compiler (a bundler plugin's, run in Node), not a module an app imports, and is not drafted" });
