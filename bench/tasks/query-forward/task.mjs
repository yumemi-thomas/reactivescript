// A TanStack Query result forwarded through a child component (RFC 06; 09 MO-10d, MO-8r, MO-12e). Until 2026-11-23 the
// library's row said its `data` field waits and fails (MO-10f, withdrawn: one library wrote it), and four variants here were
// refused by it: `data` read under no `errored` region, under no `loading` one in a client-only build, the result put in a
// record, and given whole to a child that took it for plain data. To `.rx` the query's `data` is now an accessor, as every
// library's waiting value is, and an accessor asks for no region (MO-10d): those four are given up, not caught another way.
export default {
  title: "TanStack Query: a result forwarded through child components",
  types: [
    { name: "a declared method of the result is the library's: `refetch` takes options, not a string", edit: ["todos.refetch()", "todos.refetch(\"now\")"], expect: /TS2345|TS2559/ },
    { name: "a row of the query's data is the fetcher's Todo: a field it has not is refused", edit: ["<li>{t.title}</li>", "<li>{t.titel}</li>"], expect: /TS2551|TS2339/ },
    { name: "the result's own fields are the library's: `isFetching` is a boolean", edit: ["busy={todos.isFetching}", "busy={todos.isFetching.length}"], expect: /TS2339/ },
    { name: "the options are the library's: a queryKey must be an array", edit: ['queryKey: ["todos"]', 'queryKey: "todos"'], expect: /TS2322|TS2769|TS2345/ },
  ],
  bad: [
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
