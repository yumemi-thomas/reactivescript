// A TanStack Router app on the router's file-based routing (its Vite plugin writes routeTree.gen.ts from src/routes), the
// router wrapped in the app's Shell. The layout and the pages are .rx components the route files render; host.d.rx says
// where (09 MO-14): every one under the router's provider, the pages among the root layout's children. So a page is
// checked under its layout's regions and the router, and the generated tree types every link and hook of the .rx pages.
// Until 2026-11-23 the tree was records given to a factory of the app's own (09 MO-8r), which kept the checks and gave up
// the registered route types: the two type probes given up then (a link to no route, a `from` that is no route) are back.
// (TanStack's generator takes .ts, .tsx, .js, .jsx and .vue files and reads a route file as JavaScript: an .rx file is
// not picked up, so each route file is TSX that imports its component.)
import { execFileSync, spawn, spawnSync } from "node:child_process";
import path from "node:path";

const REGIONS = "errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <main>{props.children}</main> }\n  }";
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
    { name: "a page that can fail, with no errored region around the layout's children", file: "src/pages.rx", entry: "src/pages.rx", edit: [REGIONS, "loading fallback { <p>loading…</p> } { <main>{props.children}</main> }"], expect: "UNHANDLED_FAILURE" },
    { name: "a router hook called outside the provider (in the app, above the Shell)", edit: ["export default component App() {\n", "export default component App() {\n  where = useParams({ from: \"/people/$id\" })\n"], edit2: ['import { AppRouter } from "./router.tsx"', 'import { AppRouter } from "./router.tsx"\nimport { useParams } from "@tanstack/solid-router"'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a link beside the router, in the app's frame (it reads the router's context)", edit: [FRAME, '<Shell title="Directory"><Link to="/">Home</Link><AppRouter /></Shell>'], edit2: ['import { AppRouter } from "./router.tsx"', 'import { AppRouter } from "./router.tsx"\nimport { Link } from "@tanstack/solid-router"'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a page component applied by hand as well as routed, outside the router", edit: [FRAME, `${FRAME}\n  <Person />`], edit2: ['import { AppRouter } from "./router.tsx"', 'import { AppRouter } from "./router.tsx"\nimport { Person } from "./pages.rx"'], expect: "CONTEXT_NOT_FOUND" },
    { name: "the router's component used as a value, not applied", edit: [FRAME, '<Shell title="Directory">{AppRouter}</Shell>'], expect: "COMPONENT_AS_VALUE" },
    { name: "a client-only build with no loading above a page that waits", file: "src/pages.rx", entry: "src/pages.rx", edit: ["loading fallback { <p>loading…</p> } { <main>{props.children}</main> }", "<main>{props.children}</main>"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
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
      h.check("navigation on the client", await h.until(async () => /People/.test(await h.text(page)) && !/no person/.test(await h.text(page))), await h.text(page));
      h.check("no console errors or warnings", h.problems.length === 0, h.problems);
      // the declaration itself, run: rx-verify renders the probe's scene (host.probe.mjs) and holds the view to it
      const v = spawnSync(process.execPath, ["--conditions=browser", path.join(h.dir, "../../node_modules/@reactivescript/language-server/bin/verify.js"), "--dom", "src/host.d.rx"], { cwd: h.dir, encoding: "utf8" });
      h.check("rx-verify: the host's declaration holds where it is run (each page inside its layout, the router provided)", (v.stdout.match(/ ok /g) ?? []).length === 2 && !/MISMATCH|unverified/.test(v.stdout), v.stdout + v.stderr);
    } finally { server.kill(); }
  },
};
