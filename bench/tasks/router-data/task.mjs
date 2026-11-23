// @solidjs/router 2.0's data layer (09 MO-11e, MO-12b): a `query()` read by a page, a form action, its settled
// submissions, `revalidate`. Router 2.0 removed `createAsync` and `useSubmission`: a query is read with Solid's own
// primitives (in `.rx`, an equation that awaits it) and `useSubmissions` lists what has settled.
export default {
  title: "@solidjs/router 2.0 data: a query read by a page, a form action, its submissions, revalidate",
  types: [
    { name: "the query's answer keeps the backend's type in the page", edit: ["{person.role}, asked", "{person.rank}, asked"], expect: /TS2339/ },
    { name: "a route's component is typed by its path: a page that needs `id` on a path without one", edit: ['defineRoute({ path: "/people/:id", component: Person })', 'defineRoute({ path: "/people", component: Person })'], expect: /TS2322|TS2741|TS2345|TS2769/ },
    { name: "revalidate takes a key, not a query", edit: ['revalidate("person")', "revalidate(getPerson)"], expect: /TS2345|TS2769/ },
  ],
  bad: [
    { name: "an async read with no errored boundary above the page", edit: ["  errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    loading fallback { <p class=\"wait\">loading…</p> } { <main>{props.children}</main> }\n  }", "  loading fallback { <p class=\"wait\">loading…</p> } { <main>{props.children}</main> }"], expect: "UNHANDLED_FAILURE" },
    { name: "an async read with no Loading above it (a client-only build)", spa: true, edit: ["loading fallback { <p class=\"wait\">loading…</p> } { <main>{props.children}</main> }", "<main>{props.children}</main>"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
    { name: "revalidate called while the view computes", edit: ['<p class="result">', '<p class="result">{revalidate("person")}'], expect: "IO_IN_REACTIVE" },
    { name: "revalidate given to the button, called, not passed", edit: ['onClick={() => { revalidate("person") }}', 'onClick={revalidate("person")}'], expect: "IO_IN_REACTIVE" },
    { name: "the cache cleared while the view computes (a method of `query`, with a row of its own)", edit: ['<p class="result">', '<p class="result">{query.clear()}'], expect: "IO_IN_REACTIVE" },
    { name: "a cache entry deleted by an equation: the method answers a boolean, and its row says io", edit: ["  submissions = useSubmissions(promoteForm)\n", "  submissions = useSubmissions(promoteForm)\n  gone = query.delete(\"person\")\n"], expect: "IO_IN_REACTIVE" },
    { name: "the method given to the button, called, not passed", edit: ["onClick={() => { query.clear() }}", "onClick={query.clear()}"], expect: "IO_IN_REACTIVE" },
    { name: "a submission's input kept in state: copied once, when the page first rendered", edit: ["  last = len(submissions) > 0 ? submissions[len(submissions) - 1] : null\n", "  last = len(submissions) > 0 ? submissions[len(submissions) - 1] : null\n  source sent := last == null ? null : last.input\n"], expect: "SNAPSHOT_INITIALIZER" },
    { name: "the query's answer copied into state", edit: ["  person = await getPerson(props.params.id)\n", "  asked = await getPerson(props.params.id)\n  source person := asked\n"], expect: "SNAPSHOT_INITIALIZER" },
    { name: "a router hook called above the router", edit: ["export default component App() {\n", "export default component App() {\n  all = useSubmissions(promoteForm)\n"], expect: "CONTEXT_NOT_FOUND" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base, "/people/1");
    h.check("the page reads the query for its param", await h.until(async () => /Ann.*engineer, asked 1×/.test(await h.text(page))), await h.text(page));
    await page.click(".promote");
    h.check("the form action runs, its settled submission is read, and the router asks the query again", await h.until(async () => /lead engineer, asked 2×/.test(await h.text(page)) && /Ann promoted/.test(await h.text(page, ".result"))), await h.text(page));
    await page.click(".again");
    h.check("revalidate by key, from a handler: the query is asked again", await h.until(async () => /lead engineer, asked 3×/.test(await h.text(page))), await h.text(page));
    await page.click("a[href='/']"); await h.until(async () => /People/.test(await h.text(page, "main")));
    await page.click("a[href='/people/1']");
    h.check("back at the page, the cached answer is shown", await h.until(async () => /lead engineer, asked 3×/.test(await h.text(page))), await h.text(page));
    await page.click(".forget");
    await page.click("a[href='/']"); await h.until(async () => /People/.test(await h.text(page, "main")));
    await page.click("a[href='/people/1']");
    h.check("the cache emptied by `query.clear()` from a handler: the next visit asks the query", await h.until(async () => /lead engineer, asked 4×/.test(await h.text(page))), await h.text(page));
    await page.click("a[href='/people/9']");
    h.check("a query that rejects shows at the layout's typed boundary", await h.until(async () => /no person 9/.test(await h.text(page))), await h.text(page));
    h.check("no console errors or warnings", h.problems.filter(p => !/Failed to load resource/.test(p)).length === 0, h.problems);
  },
};
