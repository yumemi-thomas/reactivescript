// File-system routing with `.rx` route files: filesystem-routing (SolidStart's file routes as a package of their own,
// for Solid 2) scans src/routes into a manifest, and @solidjs/router's adapter makes its routes of it. Each route file's
// page is its default component; `(app).rx` is the layout of every file in `(app)/`. The app's entry is `.rx` too: it
// provides what every page shares and holds a first load, around the router's component (router.ts). No `.rx` module
// applies the pages — the manifest does — so host.d.rx says what the router does with them (09 MO-14): the layout
// where the app's component applies the router's (MO-14f), every page among its layout's children. The plugin's
// generated declaration types the manifest, so the router's `paths` are the route files'.
// (Until 2026-11-23 the entry was TSX, and nothing an `.rx` entry had above the router was credited to a page.)
import { execFileSync, spawn, spawnSync } from "node:child_process";
import path from "node:path";

const REGION = "errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    <main>{props.children}</main>\n  }";
const HELD = "loading fallback { <p class=\"wait\">loading…</p> } { <Router /> }";
const VIEW = "[{ component: App, children: [{ component: Layout, children: [{ component: Home }, { component: Person }] }] }]";
const PAGE = "src/routes/(app)/people/[id].rx";
const MAIN = { file: "src/main.rx", entry: "src/main.rx" };
export default {
  title: "File-system routes (filesystem-routing, @solidjs/router): .rx route files and an .rx entry, whose region and provision hold the pages",
  entries: ["src/routes/(app).rx", "src/main.rx"],
  spa: true,    // a client-only build
  host: true,   // the manifest imports each route file's page (?rx-page): JS applies them, where src/host.d.rx says
  // the build first: the plugin writes the manifest's types (src/file-routes.d.ts), which type `paths`
  prepare(dir) { execFileSync(process.execPath, [path.join(dir, "../../node_modules/vite/bin/vite.js"), "build"], { cwd: dir, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, RX_TYPECHECK: "0" } }); },
  types: [
    { name: "a link to no route is refused (the manifest's generated types)", edit: ['paths.people("9")', 'paths.person("9")'], expect: /TS2339|TS2551/ },
    { name: "a route's param is given (the path's type is the file's name)", edit: ['paths.people("1")', "paths.people()"], expect: /TS2554|TS2345|TS2322|TS2769/ },
    { name: "the answer keeps the backend's type in the page", file: PAGE, edit: ["{person.role}, #{params.id}</p>", "{person.rank}, #{params.id}</p>"], expect: /TS2339/ },
  ],
  bad: [
    { name: "a page that can fail, with no errored region in its layout", edit: [REGION, "<main>{props.children}</main>"], expect: "UNHANDLED_FAILURE" },
    { name: "a client-only build with no loading region around the router, in the app's component", ...MAIN, edit: [HELD, "<Router />"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
    { name: "the app's loading region beside the router, not around it", ...MAIN, edit: [HELD, "loading fallback { <p class=\"wait\">loading…</p> } { <p>ready</p> }\n  <Router />"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
    { name: "the layout's pages rendered beside its region, not in it", edit: [REGION, "errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    <p>ready</p>\n  }\n  <main>{props.children}</main>"], expect: "UNHANDLED_FAILURE" },
    { name: "a layout that forgets to render its pages", edit: ["<main>{props.children}</main>", "<main>pages</main>"], expect: "NESTED_NOT_RENDERED" },
    { name: "the app's provision removed: a page under the router reads it", ...MAIN, edit: ['  provide team = { name: "Directory" }\n', ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "a router hook in the app's component, above the router", ...MAIN, edit: ["export default component App() {\n", "export default component App() {\n  at = useParams()\n"], edit2: ['import { Router } from "./router.ts"', 'import { Router } from "./router.ts"\nimport { useParams } from "@solidjs/router"'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a router hook in a component of a route file that the host's declaration does not place", file: PAGE, edit: ["export default component Person() {", "export component Crumb() {\n  at = useParams()\n  <p>{at.id}</p>\n}\nexport default component Person() {"], expect: "CONTEXT_NOT_FOUND" },
    { name: "the host's declaration says a page is rendered beside its layout, not among its children", file: "src/host.d.rx", edit: [VIEW, "[{ component: App, children: [{ component: Layout, children: [{ component: Home }] }, { component: Person }] }]"], expect: "UNHANDLED_FAILURE" },
    { name: "the host's declaration does not say the app renders its pages through the router's component", file: "src/host.d.rx", edit: ['import { Router } from "./router.ts"\n', ""], expect: "NESTED_NOT_RENDERED" },
    { name: "the router's component is not declared to provide the router", file: "src/router.d.rx", edit: [" provides(router)", ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "the page's param copied into state once: the next URL would show the old person", file: PAGE, edit: ['person = await getPerson(params.id ?? "")', 'source id := params.id ?? ""\n  person = await getPerson(id)'], expect: "SNAPSHOT_INITIALIZER" },
  ],
  async run(h) {
    const server = spawn(process.execPath, ["serve.mjs"], { cwd: h.dir, env: { ...process.env, PORT: "0" } });
    try {
      const port = await new Promise((resolve, reject) => { server.stdout.on("data", d => { const m = /listening (\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); }); server.on("exit", c => reject(new Error(`server exited ${c}`))); });
      const page = await h.page();
      await page.goto(`http://127.0.0.1:${port}/people/1`);
      h.check("the route file's page for the URL, inside its layout and the app's frame", await h.until(async () => /Directory.*Home.*Ann.*engineer, #1/.test(await h.text(page))), await h.text(page));
      await page.click("a[href='/people/9']");
      h.check("a page's NotFound shows at its layout's typed region", await h.until(async () => /no person 9/.test(await h.text(page))), await h.text(page));
      await page.click("a[href='/']");
      h.check("navigation on the client, to a route file that reads what the app's entry provides above the router", await h.until(async () => /People of Directory/.test(await h.text(page)) && !/no person/.test(await h.text(page))), await h.text(page));
      h.check("no console errors or warnings", h.problems.length === 0, h.problems);
      // the declaration itself, run: rx-verify renders the probe's scene (host.probe.mjs) and holds the view to it
      const v = spawnSync(process.execPath, ["--conditions=browser", path.join(h.dir, "../../node_modules/@reactivescript/language-server/bin/verify.js"), "--dom", "src/host.d.rx"], { cwd: h.dir, encoding: "utf8" });
      h.check("rx-verify: the host's declaration holds where it is run (each page inside its layout, rendered through the router's component)", (v.stdout.match(/ ok /g) ?? []).length === 2 && !/MISMATCH|unverified/.test(v.stdout), v.stdout + v.stderr);
    } finally { server.kill(); }
  },
};
