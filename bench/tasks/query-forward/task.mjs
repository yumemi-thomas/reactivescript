// A TanStack Query result forwarded through a child component (RFC 06; 09 MO-10l, MO-10d, MO-8r, MO-12e). The query's hook
// is the app's own module over the library's (query.js): its `data` is an accessor there, declared `pending fails(Error)
// ref` — it waits for the first answer and throws the query's error where it is read (MO-10l). Until 2026-11-23 the
// library's own row said so of a plain field (MO-10f, withdrawn: one library wrote it); for a while after, no row could,
// and four variants here were given up. They are back, refused through the accessor's rows.
export default {
  title: "TanStack Query: a result forwarded through child components",
  types: [
    { name: "a declared method of the result is the library's: `refetch` takes options, not a string", edit: ["todos.refetch()", "todos.refetch(\"now\")"], expect: /TS2345|TS2559/ },
    { name: "a row of the query's data is the fetcher's Todo: a field it has not is refused", edit: ["<li>{t.title}</li>", "<li>{t.titel}</li>"], expect: /TS2551|TS2339/ },
    { name: "the result's own fields are the library's: `isFetching` is a boolean", edit: ["busy={todos.isFetching}", "busy={todos.isFetching.length}"], expect: /TS2339/ },
    { name: "the options are the library's: a queryKey must be an array", edit: ['queryKey: ["todos"]', 'queryKey: "todos"'], expect: /TS2322|TS2769|TS2345/ },
  ],
  bad: [
    { name: "data read with no errored boundary above it", edit: ["{errored fallback(e) { <p class=\"err\">failed: {e.message}</p> } {\n      {loading fallback { <p class=\"wait\">loading…</p> } { <Todos /> }}\n    }}", "{loading fallback { <p class=\"wait\">loading…</p> } { <Todos /> }}"], expect: "UNHANDLED_FAILURE" },
    { name: "a client-only build with no loading above the data", spa: true, edit: ["{loading fallback { <p class=\"wait\">loading…</p> } { <Todos /> }}", "<Todos />"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
    { name: "the result stored in a record", edit: ["<Panel data={todos.data} status={todos.status} />", "<Panel data={({ q: todos }).q.data} status={todos.status} />"], expect: "RESULT_AS_VALUE" },
    { name: "the whole result given to a child, where its data's rows would be lost", edit: ["<Badge busy={todos.isFetching} />", "<Badge busy={todos.isFetching} /><Whole query={todos} />"], edit2: ["component Todos() {", "component Whole(props: { query: unknown }) { <i>whole</i> }\ncomponent Todos() {"], expect: "RESULT_AS_VALUE" },
    { name: "the query made in the view, not bound", edit: ["<Badge busy={todos.isFetching} />", "<Badge busy={useQuery({ queryKey: [\"x\"], queryFn: fetchTodos }).isFetching} />"], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "the query's hook beside the client's provider", edit: ["  </QueryClientProvider>", "  </QueryClientProvider>\n  <Todos />"], expect: "CONTEXT_NOT_FOUND" },
    { name: "a refetch while the view computes", edit: ["<Badge busy={todos.isFetching} />", "<Badge busy={todos.isFetching} /><i>{todos.refetch()}</i>"], expect: "IO_IN_REACTIVE" },
    { name: "the refetch called where the handler is given", edit: ["onClick={() => { todos.refetch() }}", "onClick={todos.refetch()}"], expect: "IO_IN_REACTIVE" },
    { name: "the query's data written", edit: ["onClick={() => { todos.refetch() }}", "onClick={() => { todos.data := [] }}"], expect: "WRITE_TO_NON_SOURCE" },
  ],
  async run(h) {
    const base = await h.serve();
    const page = await h.open(base);
    h.check("the list, the badge and the panel show the answer", await h.until(async () => /idle.*milk.*eggs.*success.*2 todos/.test(await h.text(page))), await h.text(page));
    // a refetch: the same query asked again, its new answer shown by every reader (the list, the count in the panel)
    await page.click(".again");
    h.check("a refetch from a handler: the new answer reaches the list and the panel", await h.until(async () => /milk.*eggs.*bread.*success.*3 todos/.test(await h.text(page))), await h.text(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
    // the error path: the backend down, the first answer a failure — shown by the errored region above the readers
    const before = h.problems.length;
    const failed = await h.open(base, "/?down");
    h.check("a failing query shows at the errored boundary, not as a crash", await h.until(async () => /failed: server down/.test(await h.text(failed))) && !/milk/.test(await h.text(failed)), await h.text(failed));
    h.check("…with no uncaught error", h.problems.slice(before).every(p => !/Uncaught|pageerror|mount threw/i.test(p)), h.problems.slice(before));
    // on the server: the query holds its first answer, and the page streams it; nothing throws outside a boundary
    const r = await h.ssr("/");
    h.check("the server renders it (the data under its boundaries)", !r.error && /milk/.test(r.text), r.error?.message ?? r.text);
  },
};
