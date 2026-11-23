// A TanStack Router app on the router's file-based routing (its Vite plugin writes routeTree.gen.ts from src/routes), the
// router wrapped in the app's Shell and under a context the app's `.rx` entry provides. The layout and the pages are .rx
// components the route files render; the layout renders its pages with the router's <Outlet />, as TanStack's own
// documentation writes one. host.d.rx says where each is (09 MO-14): the root layout where the app's component applies
// the router's, the pages where the layout applies the outlet (MO-14f). So a page is checked under its layout's regions,
// the app's provision and the router, and the generated tree types every link and hook of the .rx pages.
// Until 2026-11-23 the tree was records given to a factory of the app's own (09 MO-8r), which kept the checks and gave up
// the registered route types; then file routes whose layout took the outlet as `props.children` from its route file, with
// nothing the entry had above the router credited to a page.
// (TanStack's generator takes .ts, .tsx, .js, .jsx and .vue files and reads a route file as JavaScript: an .rx file is
// not picked up, so each route file is TSX that imports its component.)
import { execFileSync, spawn, spawnSync } from "node:child_process";
import path from "node:path";

const REGIONS = "errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <main><Outlet /></main> }\n  }";
const FRAME = '<Shell title="Directory"><AppRouter /></Shell>';
export default {
  title: "TanStack Router: file routes around an .rx layout and .rx pages, the router wrapped in the app's component",
  entries: ["src/main.rx", "src/pages.rx"],
  spa: true,    // a client-only build: nothing is rendered on a server
  host: true,   // the TSX route files import pages.rx with ?rx-lib: its components are applied by JS, where src/host.d.rx says
  // the build first: the router's plugin writes the route tree the routes are typed by
  prepare(dir) { execFileSync(process.execPath, [path.join(dir, "../../node_modules/vite/bin/vite.js"), "build"], { cwd: dir, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, RX_TYPECHECK: "0" } }); },
  types: [
    { name: "a link to no route is refused (the generated route tree)", file: "src/pages.rx", edit: ['<Link to="/">Home</Link>', '<Link to="/home">Home</Link>'], expect: /TS2322|TS2820/ },
    { name: "useParams' `from` is a route of the tree", file: "src/pages.rx", edit: ['useParams({ from: "/people/$id" })', 'useParams({ from: "/person/$id" })'], expect: /TS2322|TS2820|TS2345/ },
    { name: "the answer keeps the backend's type in the page", file: "src/pages.rx", edit: ["<p>{person.role}, #{params.id}</p>", "<p>{person.rank}, #{params.id}</p>"], expect: /TS2339/ },
  ],
  bad: [
    { name: "a page that can fail, with no errored region around the layout's children", file: "src/pages.rx", entry: "src/pages.rx", edit: [REGIONS, "loading fallback { <p>loading…</p> } { <main><Outlet /></main> }"], expect: "UNHANDLED_FAILURE" },
    { name: "a router hook called outside the provider (in the app, above the Shell)", edit: ["export default component App() {\n", "export default component App() {\n  where = useParams({ from: \"/people/$id\" })\n"], edit2: ['import { AppRouter } from "./router.tsx"', 'import { AppRouter } from "./router.tsx"\nimport { useParams } from "@tanstack/solid-router"'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a link beside the router, in the app's frame (it reads the router's context)", edit: [FRAME, '<Shell title="Directory"><Link to="/">Home</Link><AppRouter /></Shell>'], edit2: ['import { AppRouter } from "./router.tsx"', 'import { AppRouter } from "./router.tsx"\nimport { Link } from "@tanstack/solid-router"'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a page component applied by hand as well as routed, outside the router", edit: [FRAME, `${FRAME}\n  <Person />`], edit2: ['import { AppRouter } from "./router.tsx"', 'import { AppRouter } from "./router.tsx"\nimport { Person } from "./pages.rx"'], expect: "CONTEXT_NOT_FOUND" },
    { name: "the router's component used as a value, not applied", edit: [FRAME, '<Shell title="Directory">{AppRouter}</Shell>'], expect: "COMPONENT_AS_VALUE" },
    { name: "a client-only build with no loading above a page that waits", file: "src/pages.rx", entry: "src/pages.rx", edit: ["loading fallback { <p>loading…</p> } { <main><Outlet /></main> }", "<main><Outlet /></main>"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
    { name: "the app's provision removed: a page under the router reads it", edit: ['  provide team = { name: "Directory" }\n', ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "the layout's outlet beside its regions, not in them", file: "src/pages.rx", entry: "src/pages.rx", edit: [REGIONS, 'errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <p>ready</p> }\n  }\n  <main><Outlet /></main>'], expect: "UNHANDLED_FAILURE" },
    // the declaration is derived from the generated tree (`//@ routes ./routeTree.gen.ts`, 09 MO-14g), through the TSX route files
    { name: "the host's declaration edited by hand: a page the tree nests in the root layout put beside it", file: "src/host.d.rx", edit: ["{ component: Root, children: [{ component: Home }, { component: Person }] }", "{ component: Root, children: [{ component: Home }] }, { component: Person }"], gate: /HOST_VIEW_STALE.*Person is among Root's children/ },
    { name: "a route file handing its route another component than the declaration places", file: "src/routes/index.tsx", edit: ["component: Home", "component: Person"], edit2: ['import { Home } from "../pages.rx?rx-lib";', 'import { Person } from "../pages.rx?rx-lib";'], gate: /HOST_VIEW_STALE/ },
    { name: "the host's declaration does not say the layout renders its pages through the outlet", file: "src/host.d.rx", edit: ['import { Outlet } from "@tanstack/solid-router"\n', ""], expect: "NESTED_NOT_RENDERED" },
    { name: "the layout renders no outlet: its pages would never show", file: "src/pages.rx", entry: "src/pages.rx", edit: ["<main><Outlet /></main>", "<main>no pages</main>"], expect: "NESTED_NOT_RENDERED" },
    { name: "a route file giving its route a rendered element, not the component", file: "src/routes/index.tsx", ts: /TS2322|TS2769/, edit: ["component: Home", "component: <Home />"] },
  ],
  async run(h) {
    const server = spawn(process.execPath, ["serve.mjs"], { cwd: h.dir, env: { ...process.env, PORT: "0" } });
    try {
      const port = await new Promise((resolve, reject) => { server.stdout.on("data", d => { const m = /listening (\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); }); server.on("exit", c => reject(new Error(`server exited ${c}`))); });
      const page = await h.page();
      await page.goto(`http://127.0.0.1:${port}/people/1`);
      h.check("the Shell's header, and the routed page for the URL", await h.until(async () => /Directory.*Ann.*engineer, #1/.test(await h.text(page))), await h.text(page));
      await page.click("a[href='/people/9']");
      h.check("a route's NotFound shows at the root layout's typed region", await h.until(async () => /no person 9/.test(await h.text(page))), await h.text(page));
      await page.click("a[href='/']");
      h.check("navigation on the client, to a page that reads what the app's entry provides above the router", await h.until(async () => /People of Directory/.test(await h.text(page)) && !/no person/.test(await h.text(page))), await h.text(page));
      h.check("no console errors or warnings", h.problems.length === 0, h.problems);
      // the declaration itself, run: rx-verify renders the probe's scene (host.probe.mjs) and holds the view to it
      const v = spawnSync(process.execPath, ["--conditions=browser", path.join(h.dir, "../../node_modules/@reactivescript/language-server/bin/verify.js"), "--dom", "src/host.d.rx"], { cwd: h.dir, encoding: "utf8" });
      h.check("rx-verify: the host's declaration holds where it is run (each page inside its layout, rendered through the router's component and the outlet)", (v.stdout.match(/ ok /g) ?? []).length === 3 && !/MISMATCH|unverified/.test(v.stdout), v.stdout + v.stderr);
    } finally { server.kill(); }
  },
};
