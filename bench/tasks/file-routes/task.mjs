// File-system routing with `.rx` route files: filesystem-routing (SolidStart's file routes as a package of their own,
// for Solid 2) scans src/routes into a manifest, and @solidjs/router's adapter makes its routes of it. Each route file's
// page is its default component; `(app).rx` is the layout of every file in `(app)/`. No `.rx` module applies the pages
// — the manifest does — so host.d.rx says what the router does with them (09 MO-14): every page under the router's
// provider, among its layout's children. The plugin's generated declaration types the manifest, so the router's `paths`
// are the route files'.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import path from "node:path";

const REGIONS = "errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    loading fallback { <p class=\"wait\">loading…</p> } { <main>{props.children}</main> }\n  }";
const VIEW = "[{ component: Layout, children: [{ component: Home }, { component: Person }] }]";
const PAGE = "src/routes/(app)/people/[id].rx";
export default {
  title: "File-system routes (filesystem-routing, @solidjs/router): .rx route files, a layout whose regions hold its pages",
  entry: "src/routes/(app).rx",
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
    { name: "a page that can fail, with no errored region in its layout", edit: [REGIONS, "loading fallback { <p class=\"wait\">loading…</p> } { <main>{props.children}</main> }"], expect: "UNHANDLED_FAILURE" },
    { name: "a client-only build with no loading region above a page that waits", edit: ["loading fallback { <p class=\"wait\">loading…</p> } { <main>{props.children}</main> }", "<main>{props.children}</main>"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
    { name: "the layout's pages rendered beside its regions, not in them", edit: [REGIONS, "errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    loading fallback { <p class=\"wait\">loading…</p> } { <p>ready</p> }\n  }\n  <main>{props.children}</main>"], expect: "UNHANDLED_FAILURE" },
    { name: "a router hook in a component of a route file that the host's declaration does not place", file: PAGE, edit: ["export default component Person() {", "export component Crumb() {\n  at = useParams()\n  <p>{at.id}</p>\n}\nexport default component Person() {"], expect: "CONTEXT_NOT_FOUND" },
    { name: "the host's declaration says a page is rendered beside its layout, not among its children", file: "src/host.d.rx", edit: [VIEW, "[{ component: Layout, children: [{ component: Home }] }, { component: Person }]"], expect: "UNHANDLED_FAILURE" },
    { name: "the host's declaration provides no router", file: "src/host.d.rx", edit: [" provides(router)", ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "the page's param copied into state once: the next URL would show the old person", file: PAGE, edit: ['person = await getPerson(params.id ?? "")', 'source id := params.id ?? ""\n  person = await getPerson(id)'], expect: "SNAPSHOT_INITIALIZER" },
  ],
  async run(h) {
    const server = spawn(process.execPath, ["serve.mjs"], { cwd: h.dir, env: { ...process.env, PORT: "0" } });
    try {
      const port = await new Promise((resolve, reject) => { server.stdout.on("data", d => { const m = /listening (\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); }); server.on("exit", c => reject(new Error(`server exited ${c}`))); });
      const page = await h.page();
      await page.goto(`http://127.0.0.1:${port}/people/1`);
      h.check("the route file's page for the URL, inside its layout", await h.until(async () => /Home.*Ann.*engineer, #1/.test(await h.text(page))), await h.text(page));
      await page.click("a[href='/people/9']");
      h.check("a page's NotFound shows at its layout's typed region", await h.until(async () => /no person 9/.test(await h.text(page))), await h.text(page));
      await page.click("a[href='/']");
      h.check("navigation on the client, to another route file", await h.until(async () => /People/.test(await h.text(page)) && !/no person/.test(await h.text(page))), await h.text(page));
      h.check("no console errors or warnings", h.problems.length === 0, h.problems);
      // the declaration itself, run: rx-verify renders the probe's scene (host.probe.mjs) and holds the view to it
      const v = spawnSync(process.execPath, ["--conditions=browser", path.join(h.dir, "../../node_modules/@reactivescript/language-server/bin/verify.js"), "--dom", "src/host.d.rx"], { cwd: h.dir, encoding: "utf8" });
      h.check("rx-verify: the host's declaration holds where it is run (each page inside its layout, the router provided)", (v.stdout.match(/ ok /g) ?? []).length === 2 && !/MISMATCH|unverified/.test(v.stdout), v.stdout + v.stderr);
    } finally { server.kill(); }
  },
};
