// An app's own context and its provider component (03 RG-7, 09 MO-7). Solid: `createContext`, a `CartProvider` that
// holds the store, `useContext` in the readers — and "useCart must be used within a CartProvider" at run time when a
// reader is rendered outside it.
export default {
  title: "A context of the app's own: a provider component, readers under it",
  types: [
    { name: "what a reader gets is the context's type: a line has no `title`", edit: ["{line.name} × {line.qty}", "{line.title} × {line.qty}"], expect: /TS2339|TS2551/ },
    { name: "the provided action keeps its parameter's type", edit: ["c.add(name) }}>{name}", "c.add(len(name)) }}>{name}"], expect: /TS2345/ },
    { name: "a provision is checked against the context's type", edit: ["provide cart = { lines: held, add: add }", "provide cart = { lines: len(held), add: add }"], expect: /TS2322|TS2345|TS2739|TS2740|TS2741/ },
  ],
  bad: [
    { name: "a reader rendered beside the provider, not under it (a sibling)", edit: ["    <Summary />\n  </CartProvider>", "  </CartProvider>\n  <Summary />"], expect: "CONTEXT_NOT_FOUND" },
    { name: "the context read above its provider: in the component that renders it", edit: ["export default component App() {\n", "export default component App() {\n  c = use cart\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "provided in one branch of the page, read in the other", edit: ["    <header><Badge /></header>", "    <header></header>"], edit2: ["export default component App() {\n", "export default component App() {\n  <aside><Badge /></aside>\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "a reader writing the provided state itself, not through the action", edit: ["onClick={() => { c.add(name) }}", "onClick={() => { c.lines := [] }}"], expect: "WRITE_TO_NON_SOURCE" },
    { name: "the provided list changed in place by a reader", edit: ["onClick={() => { c.add(name) }}", "onClick={() => { c.lines.push({ name: name, qty: 1 }) }}"], expect: "MUTATION_IN_PLACE" },
    { name: "the provided action called while the view computes", edit: ["<span class=\"badge\">{len(c.lines)} in the cart</span>", "<span class=\"badge\">{c.add(\"tea\")} in the cart</span>"], expect: "ACTION_CALLED_IN_OWNED_SCOPE" },
    { name: "the same through a prop: a row's handler called, not passed on", edit: ["<li><button class=\"add\" onClick={() => { c.add(name) }}>{name}</button></li>", "<li><button class=\"add\" onClick={c.add(name)}>{name}</button></li>"], expect: "ACTION_CALLED_IN_OWNED_SCOPE" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("mounted: every reader sees the provider's empty cart", await h.until(async () => /0 in the cart/.test(await h.text(page))), await h.text(page));
    await page.click("text=tea"); await page.click("text=milk"); await page.click("text=tea");
    h.check("the provided action writes the provider's state; the badge and the summary follow", await h.until(async () => /3 in the cart/.test(await h.text(page)) && (await h.text(page, ".summary")) === "tea × 1milk × 1tea × 1"), await h.text(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
    const r = await h.ssr("/");
    h.check("the server renders the readers under the provider", !r.error && /0 in the cart/.test(r.text), r.error?.message ?? r.text);
  },
};
