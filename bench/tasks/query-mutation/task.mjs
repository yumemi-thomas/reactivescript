// A TanStack Query mutation, invalidation, and the cache sent from the server (09 MO-10f, MO-10g, MO-12; 10 SV).
// Solid: `useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries(…) })`, `dehydrate` / `hydrate`.
const title = async page => (await page.textContent("h1").catch(() => "")) ?? "";
// the query's key left without the id its function reads: picking the other todo must show the other todo
const other = async h => {
  const base = await h.serve(); const page = await h.open(base);
  await h.until(async () => (await title(page)) === "milk");
  await page.click(".two"); await new Promise(r => setTimeout(r, 400));
  h.check("the other todo is shown", (await title(page)) === "eggs", await title(page));
};
export default {
  title: "TanStack Query: a mutation that invalidates its query, and the cache sent from the server",
  known: {
    "the query's function reads the id, its key does not": "08 CN-3b, CN-5; 09 MO-10g: what a library does with a callback is its declaration's to say, and the checker reads no library's semantics. The closure is not frozen — it reads `props.id` when TanStack calls it, so E-10 holds — but TanStack asks again only when the key's hash changes: the staleness is the cache's contract (its ESLint plugin's `exhaustive-deps`), and `.d.rx` has no word for \"this callback is asked again only when that sibling key changes\". `tracked` says when the callback is called, not what re-runs it. A word for it (`queryFn: keyed(queryKey) () => Promise<T>`: every changing value the closure reads is named in the key) would make this a static check; it is proposed in spec/rfc-revisions-2026-11-22.md and not ruled, so the variant stays as the measure of the gap.",
  },
  types: [
    { name: "the query's data is the fetcher's Todo", edit: ["<h1>{todo.data.title}</h1>", "<h1>{todo.data.titel}</h1>"], expect: /TS2339|TS2551/ },
    { name: "the mutation's variables are its function's parameter", edit: ["rename.mutate({ id: props.id, title: `${todo.data.title}!` })", "rename.mutate({ id: props.id, name: `${todo.data.title}!` })"], expect: /TS2353|TS2345|TS2322/ },
    { name: "a query key is an array", edit: ['queryKey: ["todo", props.id], queryFn', 'queryKey: "todo", queryFn'], expect: /TS2322|TS2769|TS2345/ },
  ],
  bad: [
    { name: "the query's function reads the id, its key does not: the cache answers the first todo for every id", edit: ['todo = useQuery({ queryKey: ["todo", props.id], queryFn', 'todo = useQuery({ queryKey: ["todo"], queryFn'], expect: "KEY_MISSES_INPUT", orSafe: other },
    { name: "the mutation run while the view computes", edit: ['<p class="saved">saved {saved}</p>', '<p class="saved">saved {rename.mutate({ id: 1, title: "x" })}</p>'], expect: "IO_IN_REACTIVE" },
    { name: "the cache invalidated while the view computes", edit: ['<p class="saved">saved {saved}</p>', '<p class="saved">saved {client.invalidateQueries({ queryKey: ["todo"] })}</p>'], expect: "IO_IN_REACTIVE" },
    { name: "the mutation made in a handler, on every click", edit: ["onClick={() => { rename.mutate({ id: props.id, title: `${todo.data.title}!` }) }}", "onClick={() => { useMutation({ mutationFn: renameTodo }).mutate({ id: props.id, title: \"x\" }) }}"], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "the query read with no errored boundary", edit: ["    {errored fallback(e) { <p class=\"err\">failed: {e.message}</p> } {\n      {loading fallback { <p class=\"wait\">loading…</p> } { <Todo id={id} /> }}\n    }}", "    {loading fallback { <p class=\"wait\">loading…</p> } { <Todo id={id} /> }}"], expect: "UNHANDLED_FAILURE" },
    { name: "a query hook used outside the client's provider", edit: ["  client = makeClient()\n", "  client = makeClient()\n  stray = useQueryClient()\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "the mutation's callback written as a plain function that writes state, where the library might call it in a computation", edit: ["    mutationFn: renameTodo,", "    mutationFn: (v) => { saved := saved + 1 },"], expect: "REACTIVE_WRITE_IN_OWNED_SCOPE" },
  ],
  async run(h) {
    // on the server: the query answers, and the page carries the cache
    const r = await h.ssr("/");
    h.check("the server renders the todo, and sends the cache with the page", !r.error && /milk/.test(r.text) && /"queryKey":\["todo",1\]/.test(r.html.replace(/&quot;/g, '"')), r.error?.message ?? r.html.slice(0, 500));
    const base = await h.serve({ ssr: true }); const page = await h.open(base);
    h.check("hydrated from the cache the server sent: the browser does not ask for the todo again", await h.until(async () => (await title(page)) === "milk") && (await page.evaluate(() => window.__backend.fetches)) === 0, `title ${await title(page)}, fetches in the browser: ${await page.evaluate(() => window.__backend.fetches)}`);
    await page.click(".rename");
    h.check("the mutation: once the server took it, the query is invalidated and asked again, and the callback writes app state", await h.until(async () => (await title(page)) === "milk!" && /saved 1/.test(await h.text(page, ".saved"))), `${await title(page)} / ${await h.text(page, ".saved")}`);
    await page.click(".two");
    h.check("another id is another query (the key holds it)", await h.until(async () => (await title(page)) === "eggs"), await title(page));
    h.check("no console errors or warnings (no hydration mismatch)", h.problems.length === 0, h.problems);
  },
};
