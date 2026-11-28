// TanStack Router's code-based routes, written in `.rx` with the library's own functions (09 MO-11u). Each route is made
// of a component (`createRoute({ component })`), and the provider renders the page whose path matches: the rows of
// `createRoute` and `createRootRoute` say `renders(RouterProvider)`, so a page is checked beneath the provider, wherever
// the app put it — here in the app's `Shell`, a module away, under a context the app provides. The route tree is a value
// of the program's, so it registers the router (register.d.ts), and every link and hook is typed by the routes.
// `renders(later)`, a prop's `renders`, `nests(… under …)` and `outlet` said this until 2026-11-23 and stay withdrawn:
// they followed a value by mention to the prop that rendered it. This word names the place and follows nothing: by
// itself it places the pages side by side beneath the provider. Which page is whose child is the router's knowledge, and
// host.d.rx says it — derived from the router main.rx exports (`//@ routes ./main.rx`, 09 MO-14g: rx-declare compiles
// the module, runs it, and asks the router object for its tree) — so the root layout's regions around its <Outlet />
// hold its pages (MO-14h). Until 2026-11-25 that program was refused, and each page held its own failure and wait.
// The declarations are rx-declare's drafts with the words the program needs written by hand (bench/needed.txt), and the
// router's own tree.
import { spawnSync } from "node:child_process";
import path from "node:path";
const REGIONS = 'errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <main><Outlet /></main> }\n  }';
export default {
  title: "TanStack Router, code-based routes: pages given to createRoute, rendered beneath the provider in the app's Shell, a layout's regions around its outlet",
  types: [
    { name: "a link to no route is refused (the route tree registers the router)", edit: ['<Link to="/">Home</Link>', '<Link to="/home">Home</Link>'], expect: /TS2322|TS2820/ },
    { name: "useParams' `from` is a route of the tree", edit: ['useParams({ from: "/people/$id" })', 'useParams({ from: "/person/$id" })'], expect: /TS2322|TS2820|TS2345/ },
    { name: "the Shell's router prop is the library's router type", edit: ['<Shell router={router} title="Directory" />', '<Shell router={rootRoute} title="Directory" />'], expect: /TS2322|TS2741|TS2739|TS2740/ },
    { name: "what the backend answers keeps its type in the page", edit: ["{person.role}, #{params.id}", "{person.rol}, #{params.id}"], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "a page that can fail, with no errored region around the root layout's outlet nor above the provider", edit: [REGIONS, "loading fallback { <p>loading…</p> } { <main><Outlet /></main> }"], expect: "UNHANDLED_FAILURE" },
    { name: "a client-only build with no loading region around the outlet, for a page that waits", spa: true, edit: ["loading fallback { <p>loading…</p> } { <main><Outlet /></main> }", "<main><Outlet /></main>"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
    { name: "the layout's outlet beside its regions, not in them", edit: [REGIONS, 'errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <p>ready</p> }\n  }\n  <main><Outlet /></main>'], expect: "UNHANDLED_FAILURE" },
    { name: "the root layout renders no outlet: its pages would never show", edit: ["<main><Outlet /></main>", "<main>no pages</main>"], expect: "NESTED_NOT_RENDERED" },
    { name: "the host's declaration removed: the fn's row alone places the pages side by side beneath the provider, and the layout's regions hold none", file: "host.d.rx", edit: ["export default component nests(children in component) = [{ component: App, children: [{ component: Root, children: [{ component: Home }, { component: Person }] }] }]", "export default component nests(children in component) = []"], expect: "UNHANDLED_FAILURE" },
    // the declaration is derived from the router (`//@ routes ./main.rx`): one that falls behind is refused
    { name: "a route added to the tree, and the host's declaration not written again", edit: ["export router = createRouter({ routeTree: peek rootRoute.addChildren([indexRoute, personRoute]) })", "export component About() {\n  <h1>About</h1>\n}\naboutRoute = createRoute({ getParentRoute: () => rootRoute, path: \"/about\", component: About })\nexport router = createRouter({ routeTree: peek rootRoute.addChildren([indexRoute, personRoute, aboutRoute]) })"], gate: /HOST_VIEW_STALE.*About is a route/ },
    { name: "the host's declaration edited by hand: a page taken out of the root route's children", file: "host.d.rx", edit: ["{ component: Root, children: [{ component: Home }, { component: Person }] }", "{ component: Root, children: [{ component: Home }] }, { component: Person }"], gate: /HOST_VIEW_STALE.*Person is among Root's children/ },
    { name: "the app's context provided nowhere above the provider", edit: ['  provide accent = "dark"\n', ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "a router hook called outside the provider (in the app, above the Shell)", edit: ["export default component App() {\n", "export default component App() {\n  where = useParams({ from: \"/people/$id\" })\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "a page component applied by hand as well as routed, outside the router", edit: ['<Shell router={router} title="Directory" />', '<Shell router={router} title="Directory" />\n  <Person />'], expect: "CONTEXT_NOT_FOUND" },
    { name: "the row without the word: a page under a root of its own reads no router", file: "rx-types/@tanstack/solid-router.d.rx", edit: [" renders(RouterProvider)", " instantiates"], expect: "CONTEXT_NOT_FOUND" },
    { name: "a page's component given as a rendered element, not the component", edit: ['path: "/", component: Home })', 'path: "/", component: <Home /> })'], expect: "PARSE" },
  ],
  async run(h) {
    const base = await h.serve();
    const page = await h.open(base, "/people/1");
    h.check("the Shell's header, and the routed page for the URL", await h.until(async () => /Directory.*Ann.*engineer, #1/.test(await h.text(page))), await h.text(page));
    h.check("a page reads the context the app provides above the provider", await page.locator("h1.dark").count() === 1, await h.text(page));
    await page.click("a[href='/people/9']");
    h.check("a page's NotFound shows at the root layout's region, around its outlet, and the navigation stays", await h.until(async () => /no person 9/.test(await h.text(page)) && /Home/.test(await h.text(page, "nav"))), await h.text(page));
    await page.click("a[href='/']");
    h.check("navigation on the client", await h.until(async () => /People/.test(await h.text(page)) && !/no person/.test(await h.text(page))), await h.text(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
    // the declaration itself, run: rx-verify renders the probe's scene (host.probe.mjs) and holds the view to it
    const v = spawnSync(process.execPath, ["--conditions=browser", path.join(h.dir, "../../node_modules/@reactivescript/language-server/bin/verify.js"), "--dom", "host.d.rx"], { cwd: h.dir, encoding: "utf8" });
    h.check("rx-verify: the host's declaration holds where it is run (each page inside the root layout, rendered through the library's provider and its outlet)", (v.stdout.match(/ held /g) ?? []).length === 3 && !/MISMATCH|unverified/.test(v.stdout), v.stdout + v.stderr);
  },
};
