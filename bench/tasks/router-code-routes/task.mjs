// TanStack Router's code-based routes, written in `.rx` with the library's own functions (09 MO-11u). Each route is made
// of a component (`createRoute({ component })`), and the provider renders the page whose path matches: the rows of
// `createRoute` and `createRootRoute` say `renders(RouterProvider)`, so a page is checked beneath the provider, wherever
// the app put it — here in the app's `Shell`, a module away, under a context the app provides. The route tree is a value
// of the program's, so it registers the router (register.d.ts), and every link and hook is typed by the routes.
// `renders(later)`, a prop's `renders`, `nests(… under …)` and `outlet` said this until 2026-11-23 and stay withdrawn:
// they followed a value by mention to the prop that rendered it. This word names the place and follows nothing. It
// places the pages side by side beneath the provider — a layout's own regions are not credited to the pages its outlet
// renders (a tree whose nesting is checked is a factory's, or a host declaration's: `router-provider`, `file-routes`) —
// so a page holds its own failure and its own wait, as this one does.
// The declaration is rx-declare's draft, as it is (no word by hand): the types' rows, and what known.js says of the release.
export default {
  title: "TanStack Router, code-based routes: pages given to createRoute, rendered beneath the provider in the app's Shell",
  types: [
    { name: "a link to no route is refused (the route tree registers the router)", edit: ['<Link to="/">Home</Link>', '<Link to="/home">Home</Link>'], expect: /TS2322|TS2820/ },
    { name: "useParams' `from` is a route of the tree", edit: ['useParams({ from: "/people/$id" })', 'useParams({ from: "/person/$id" })'], expect: /TS2322|TS2820|TS2345/ },
    { name: "the Shell's router prop is the library's router type", edit: ['<Shell router={router} title="Directory" />', '<Shell router={rootRoute} title="Directory" />'], expect: /TS2322|TS2741|TS2739|TS2740/ },
    { name: "what the backend answers keeps its type in the page", edit: ["{person.role}, #{props.id}", "{person.rol}, #{props.id}"], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "a page that can fail, with no errored region of its own nor above the provider", edit: ['errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } { loading fallback { <p>loading…</p> } { <PersonCard id={params.id} /> } }', "loading fallback { <p>loading…</p> } { <PersonCard id={params.id} /> }"], expect: "UNHANDLED_FAILURE" },
    { name: "a client-only build with no loading region for a page that waits", spa: true, edit: ['{ loading fallback { <p>loading…</p> } { <PersonCard id={params.id} /> } }', "{ <PersonCard id={params.id} /> }"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
    { name: "the app's context provided nowhere above the provider", edit: ['  provide accent = "dark"\n', ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "a router hook called outside the provider (in the app, above the Shell)", edit: ["export default component App() {\n", "export default component App() {\n  where = useParams({ from: \"/people/$id\" })\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "a page component applied by hand as well as routed, outside the router", edit: ['<Shell router={router} title="Directory" />', '<Shell router={router} title="Directory" />\n  <Person />'], expect: "CONTEXT_NOT_FOUND" },
    { name: "the row without the word: a page under a root of its own reads no router", file: "rx-types/@tanstack/solid-router.d.rx", edit: [" instantiates renders(RouterProvider)", " instantiates"], expect: "CONTEXT_NOT_FOUND" },
    { name: "a page's component given as a rendered element, not the component", edit: ['path: "/", component: Home })', 'path: "/", component: <Home /> })'], expect: "PARSE" },
  ],
  async run(h) {
    const base = await h.serve();
    const page = await h.open(base, "/people/1");
    h.check("the Shell's header, and the routed page for the URL", await h.until(async () => /Directory.*Ann.*engineer, #1/.test(await h.text(page))), await h.text(page));
    h.check("a page reads the context the app provides above the provider", await page.locator("h1.dark").count() === 1, await h.text(page));
    await page.click("a[href='/people/9']");
    h.check("a page's NotFound shows at the page's own region, and the navigation stays", await h.until(async () => /no person 9/.test(await h.text(page)) && /Home/.test(await h.text(page, "nav"))), await h.text(page));
    await page.click("a[href='/']");
    h.check("navigation on the client", await h.until(async () => /People/.test(await h.text(page)) && !/no person/.test(await h.text(page))), await h.text(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
