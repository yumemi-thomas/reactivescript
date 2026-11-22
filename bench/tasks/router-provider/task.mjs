// A TanStack Router app whose route tree is given to a factory of the app's own (09 MO-8r, MO-11f, MO-11i, MO-12e). Until
// 2026-11-23 the tree was written in `.rx` with the library's own `createRoute`, declared `renders(later)` and
// `nests(component under getParentRoute)`, rendered by a `<RouterProvider>` whose prop was declared `renders`, at an
// `<Outlet />` declared `outlet` (MO-11o, MO-11p, withdrawn: one library wrote them). The tree is records now, in the shape
// @solidjs/router's factory has, and `routes.js` builds the library's routes from them. Given up with the old form, and
// not caught another way: the registered route types of a tree written in `.rx` (a link to no route, a `from` that is no
// route) and the type of a router passed as a prop (three type probes), and the router built and never rendered
// (bench/README.md lists each with its reason).
export default {
  title: "TanStack Router: a route tree given to the app's own factory, the router wrapped in the app's component",
  types: [
    { name: "a route record without its component is refused (the factory types its tree)", edit: ['{ path: "/", component: Home }', '{ path: "/" }'], expect: /TS2741|TS2322|TS2345/ },
    { name: "the link's `to` is the library's: a number is refused", edit: ['<Link to="/">Home</Link>', '<Link to={1}>Home</Link>'], expect: /TS2322/ },
    { name: "the answer keeps the backend's type in the page", edit: ["<p>{person.role}, #{params.id}</p>", "<p>{person.rank}, #{params.id}</p>"], expect: /TS2339/ },
  ],
  bad: [
    { name: "a page that can fail, with no errored boundary around the layout's children", edit: ["errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <main>{props.children}</main> }\n  }", "loading fallback { <p>loading…</p> } { <main>{props.children}</main> }"], expect: "UNHANDLED_FAILURE" },
    { name: "a router hook called outside the provider (in the app, above the Shell)", edit: ["export default component App() {\n", "export default component App() {\n  where = useParams({ from: \"/people/$id\" })\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "a link beside the router, in the app's frame (it reads the router's context)", edit: ['<Shell title="Directory"><AppRouter /></Shell>', '<Shell title="Directory"><Link to="/">Home</Link><AppRouter /></Shell>'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a page component applied by hand as well as routed, outside the router", edit: ['<Shell title="Directory"><AppRouter /></Shell>', '<Shell title="Directory"><AppRouter /></Shell>\n  <Person />'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a page's component given as a rendered element, not the component", edit: ['path: "/", component: Home }', 'path: "/", component: <Home /> }'], expect: "PARSE" },
    { name: "the made router used as a value, not applied", edit: ['<Shell title="Directory"><AppRouter /></Shell>', '<Shell title="Directory">{AppRouter}</Shell>'], expect: "COMPONENT_AS_VALUE" },
    { name: "a client-only build with no loading above a page that waits", spa: true, edit: ["loading fallback { <p>loading…</p> } { <main>{props.children}</main> }", "<main>{props.children}</main>"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
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
