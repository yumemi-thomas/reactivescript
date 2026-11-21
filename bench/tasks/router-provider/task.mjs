// A TanStack Router provider wrapped in a plain .rx component (RFC 18, 09 MO-11o/p).
export default {
  title: "TanStack Router: the provider wrapped in the app's own component",
  types: [
    { name: "a link to no route is refused (the registered route tree)", edit: ['<Link to="/">Home</Link>', '<Link to="/home">Home</Link>'], expect: /TS2322|TS2820/ },
    { name: "useParams' `from` is a route of the tree", edit: ['useParams({ from: "/people/$id" })', 'useParams({ from: "/person/$id" })'], expect: /TS2322|TS2820|TS2345/ },
    { name: "the Shell's router prop is the library's router type", edit: ['<Shell router={router} title="Directory" />', '<Shell router={rootRoute} title="Directory" />'], expect: /TS2322|TS2741|TS2739|TS2740/ },
  ],
  bad: [
    { name: "a page that can fail, with no errored boundary around the outlet", edit: ["errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <main><Outlet /></main> }\n  }", "loading fallback { <p>loading…</p> } { <main><Outlet /></main> }"], expect: "UNHANDLED_FAILURE" },
    { name: "a router hook called outside the provider (in the app, above the Shell)", edit: ["export default component App() {\n", "export default component App() {\n  where = useParams({ from: \"/people/$id\" })\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "the router built, and never rendered", edit: ['<Shell router={router} title="Directory" />', "<h1>Directory</h1>"], expect: "COMPONENT_AS_VALUE" },
    { name: "a page component applied by hand as well as routed, outside the router", edit: ['<Shell router={router} title="Directory" />', '<Shell router={router} title="Directory" />\n  <Person />'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a page's component given as a rendered element, not the component", edit: ['path: "/", component: Home })', 'path: "/", component: <Home /> })'], expect: "PARSE" },
    { name: "a client-only build with no loading above a page that waits", spa: true, edit: ["loading fallback { <p>loading…</p> } { <main><Outlet /></main> }", "<main><Outlet /></main>"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
  ],
  async run(h) {
    const base = await h.serve();
    const page = await h.open(base, "/people/1");
    h.check("the Shell's header, and the routed page for the URL", await h.until(async () => /Directory.*Ann.*engineer, #1/.test(await h.text(page))), await h.text(page));
    await page.click("a[href='/people/9']");
    h.check("a route's NotFound shows at the root's typed boundary", await h.until(async () => /no person 9/.test(await h.text(page))), await h.text(page));
    await page.click("a[href='/']");
    h.check("navigation on the client", await h.until(async () => /People/.test(await h.text(page)) && !/no person/.test(await h.text(page))), await h.text(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
