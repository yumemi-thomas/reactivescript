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
    { name: "the context provided beside <Markdown>, not above it", edit: ["  <Themed>\n    <Markdown builtins={builtins}>{text}</Markdown>\n  </Themed>\n", "  <Themed><p>themed</p></Themed>\n  <Markdown builtins={builtins}>{text}</Markdown>\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "…the same with the record written in the prop", edit: ["  <Themed>\n    <Markdown builtins={builtins}>{text}</Markdown>\n  </Themed>\n", "  <Themed><p>themed</p></Themed>\n  <Markdown builtins={{ Root: Page, Heading: Heading }}>{text}</Markdown>\n  <Themed><Markdown builtins={builtins}>{text}</Markdown></Themed>\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "the named record read elsewhere too: a component taken out of it is a value nothing renders", edit: ["export default component App() {\n", "export default component App() {\n  First = builtins.Heading\n"], expect: "COMPONENT_AS_VALUE" },
    { name: "the record computed, not written: the checker reads the components a literal names", edit: ["builtins = { Root: Page, Heading: Heading, Paragraph: Paragraph, Strong: Strong }", "source plain := false\nbuiltins = plain ? { Root: Page } : { Root: Page, Heading: Heading, Paragraph: Paragraph, Strong: Strong }"], expect: "COMPONENT_AS_VALUE" },
  ],
  note: "the runtime component is its module's default export, imported as JavaScript imports one (`import { default as Markdown }`) and declared by a row named `default` (09 MO-8u, 2026-11-25: a module of the app's own, markdown.js, handed it out by name until then); the row is the draft's. A component in a record given to a prop is read as a direct one is (09 MO-11c, 2026-11-24): it was `COMPONENT_AS_VALUE`; and the record may have a name, where every mention of the name is that prop (2026-11-25: it was `COMPONENT_AS_VALUE` too). `solid-marked/compiler` is the build-time compiler (a bundler plugin's, run in Node), not a module an app imports, and is not drafted" });
