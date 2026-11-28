// Solid's own start mode — `solid({ start, ssr: true })`, a mode of @solidjs/vite-plugin 3: the plugin owns the entries,
// the dev server's render and the build, so an app is its root component and its routes, with no index.html, no mount
// file and no server file. SolidStart is not needed for it (and @solidjs/start 2 still asks for Solid 1.9). Here the root
// is an `.rx` component, the routes are `.rx` files scanned by filesystem-routing into @solidjs/router's routes, and
// every request is rendered on the server, streamed, and hydrated. No `.rx` module applies the pages — the manifest
// does — so host.d.rx says what the router does with them (09 MO-14), derived from the routes directory (MO-14g).
// It is bench/tasks/file-routes' program (a client-only build over the same router and the same routes) served: what
// that task builds an index.html, a boot script and a static server for is the plugin's here.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REGION = "errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    <main>{props.children}</main>\n  }";
const HELD = "loading fallback { <p class=\"wait\">loading…</p> } { <Router /> }";
const VIEW = "[{ component: App, children: [{ component: Layout, children: [{ component: Home }, { component: Person }] }] }]";
const PAGE = "src/routes/(app)/people/[id].rx", LAYOUT = "src/routes/(app).rx", HOME = "src/routes/(app)/index.rx";
const APP = { file: "src/App.rx", entry: "src/App.rx" };
const listening = (child, re) => new Promise((resolve, reject) => { child.stdout.on("data", d => { const m = re.exec(String(d)); if (m) resolve(Number(m[1])); }); child.on("exit", c => reject(new Error(`server exited ${c}`))); });
// (the whole response: what a boundary waited for is streamed after the document's end, and moved in by a script)
const bodyText = html => html.replace(/<head[\s\S]*?<\/head>/, "").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--.*?-->/g, "").replace(/<[^>]*>/g, " ").replace(/&#8230;/g, "…").replace(/\s+/g, " ").trim();
export default {
  title: "Solid's start mode (@solidjs/vite-plugin `start`, filesystem-routing, @solidjs/router): an .rx root and .rx route files, served, streamed and hydrated",
  entries: [LAYOUT, "src/App.rx", PAGE],
  host: true,   // the manifest imports each route file's page (?rx-page), and start mode the root (vite.config.ts: `pages`): JS applies them, where src/host.d.rx says
  // the build first: filesystem-routing's plugin writes the manifest's types (src/file-routes.d.ts), which type `paths`,
  // and start mode writes both bundles and the Node server (dist/server/node.js)
  prepare(dir) { execFileSync(process.execPath, [path.join(dir, "../../node_modules/vite/bin/vite.js"), "build"], { cwd: dir, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, RX_TYPECHECK: "0" } }); },
  types: [
    { name: "a link to no route is refused (the manifest's generated types)", edit: ['paths.people("9")', 'paths.person("9")'], expect: /TS2339|TS2551/ },
    { name: "a route's param is given (the path's type is the file's name)", edit: ['paths.people("1")', "paths.people()"], expect: /TS2554|TS2345|TS2322|TS2769/ },
    { name: "the answer keeps the backend's type in the page", file: PAGE, edit: ["{person.role}, #{params.id}</p>", "{person.rank}, #{params.id}</p>"], expect: /TS2339/ },
  ],
  bad: [
    { name: "a page that can fail, with no errored region in its layout", edit: [REGION, "<main>{props.children}</main>"], expect: "UNHANDLED_FAILURE" },
    { name: "the layout's pages rendered beside its region, not in it", edit: [REGION, "errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    <p>ready</p>\n  }\n  <main>{props.children}</main>"], expect: "UNHANDLED_FAILURE" },
    { name: "a layout that forgets to render its pages", edit: ["<main>{props.children}</main>", "<main>pages</main>"], expect: "NESTED_NOT_RENDERED" },
    { name: "the root's provision removed: a page under the router reads it", ...APP, edit: ['  provide team = { name: "Directory" }\n', ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "a router hook in the root, above the router", ...APP, edit: ["export default component App() {\n", "export default component App() {\n  at = useParams()\n"], edit2: ['import { Router } from "./router.ts"', 'import { Router } from "./router.ts"\nimport { useParams } from "@solidjs/router"'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a router hook in a component of a route file that the host's declaration does not place", file: PAGE, edit: ["export default component Person() {", "export component Crumb() {\n  at = useParams()\n  <p>{at.id}</p>\n}\nexport default component Person() {"], expect: "CONTEXT_NOT_FOUND" },
    { name: "module state written while the root renders (each request would write it)", ...APP, edit: ["<header>Directory</header>", "<header>{clicks := 1}</header>"], expect: "PARSE" },
    { name: "the page's param copied into state once: the next URL would show the old person", file: PAGE, edit: ['person = await getPerson(params.id ?? "")', 'source id := params.id ?? ""\n  person = await getPerson(id)'], expect: "SNAPSHOT_INITIALIZER" },
    { name: "the host's declaration says a page is rendered beside its layout, not among its children", file: "src/host.d.rx", edit: [VIEW, "[{ component: App, children: [{ component: Layout, children: [{ component: Home }] }, { component: Person }] }]"], expect: "UNHANDLED_FAILURE" },
    { name: "the router's component is not declared to provide the router", file: "src/router.d.rx", edit: [" provides(router)", ""], expect: "CONTEXT_NOT_FOUND" },
    // the declaration is derived from the routes directory (`//@ routes ./routes ./App.rx`, 09 MO-14g)
    { name: "a route file added, and the host's declaration not written again", add: ["src/routes/(app)/about.rx", "export default component About() {\n  <h1>About</h1>\n}\n"], gate: /HOST_VIEW_STALE.*About is a route/ },
    { name: "a route file added: the build refuses the stale declaration before it bundles", add: ["src/routes/(app)/about.rx", "export default component About() {\n  <h1>About</h1>\n}\n"], build: /HOST_VIEW_STALE[\s\S]*About is a route/ },
  ],
  async run(h) {
    // the build start mode made: `node dist/server/node.js` serves the client's files and renders every other request
    const server = spawn(process.execPath, ["dist/server/node.js"], { cwd: h.dir, env: { ...process.env, PORT: "0", HOST: "127.0.0.1" } });
    try {
      const base = `http://127.0.0.1:${await listening(server, /Listening on http:\/\/[^:]+:(\d+)/)}`;
      const served = bodyText(await (await fetch(base + "/people/2")).text());
      h.check("/people/2 is rendered on the server: the root's frame, the layout, and the page once its query answers (streamed after the fallback)", /Directory/.test(served) && /loading…/.test(served) && /Bo\s*designer\s*,\s*#\s*2/.test(served), served);
      const home = bodyText(await (await fetch(base + "/")).text());
      h.check("/ on the server: a route file reads what the root provides above the router", /People of Directory/.test(home), home);
      const missing = bodyText(await (await fetch(base + "/people/9")).text());
      h.check("/people/9: the page's NotFound is shown by its layout's region, on the server", /no person 9/.test(missing), missing);
      const page = await h.page();
      await page.goto(base + "/people/2");
      const text = async () => ((await page.textContent("body")) ?? "").replace(/\s+/g, " ").trim();
      h.check("hydrated under that URL", await h.until(async () => /Bo\s*designer, #2/.test(await text())), await text());
      await page.evaluate(() => { window.__same = true; });
      await page.click("button.counter"); await page.click("button.counter");
      h.check("the hydrated page is live: an .rx source of the root's module written by a click", await h.until(async () => (await text()).includes("clicks: 2")), await text());
      await page.click("a[href='/']");
      h.check("client navigation, to a route file that reads the root's provision", await h.until(async () => /People of Directory/.test(await text())), await text());
      await page.click("a[href='/people/9']");
      h.check("the page's NotFound at its layout's typed region, in the browser", await h.until(async () => (await text()).includes("no person 9")), await text());
      h.check(".rx module state kept across routes, in the same document", (await text()).includes("clicks: 2") && await page.evaluate(() => window.__same === true), await text());
      h.check("no console errors or warnings (no hydration mismatch)", h.problems.length === 0, h.problems);
      await page.close();
      // the declaration itself, run: rx-verify renders the probe's scene (host.probe.mjs), built from the routes directory
      const v = spawnSync(process.execPath, ["--conditions=browser", path.join(h.dir, "../../node_modules/@reactivescript/language-server/bin/verify.js"), "--dom", "src/host.d.rx"], { cwd: h.dir, encoding: "utf8" });
      h.check("rx-verify: the host's declaration holds where it is run (each page inside its layout, rendered through the router's component)", (v.stdout.match(/ held /g) ?? []).length === 2 && !/MISMATCH|unverified/.test(v.stdout), v.stdout + v.stderr);
    } finally { server.kill(); }
    // the dev server: start mode renders each request in Vite's own server, and an edit of a route file is shown
    const dev = spawn(process.execPath, ["dev.mjs"], { cwd: h.dir, env: process.env });
    const file = path.join(h.dir, HOME), was = readFileSync(file, "utf8");
    try {
      const base = `http://127.0.0.1:${await listening(dev, /listening (\d+)/)}`;
      const from = h.problems.length;
      const first = bodyText(await (await fetch(base + "/", { headers: { accept: "text/html" } })).text());
      h.check("the dev server renders the request itself (no server file)", /People of Directory/.test(first), first);
      const page = await h.page();
      await page.goto(base + "/");
      const text = async () => ((await page.textContent("body")) ?? "").replace(/\s+/g, " ").trim();
      await page.click("button.counter");
      h.check("the dev server: hydrated and live", await h.until(async () => /clicks: 1/.test(await text()), 300), await text());
      writeFileSync(file, was.replace("People of", "People in"));
      h.check("the dev server: an edited route file is shown, still under the root's provision", await h.until(async () => /People in Directory/.test(await text()), 300), `${await text()} ${h.problems.slice(from).join(" | ")}`);
      const again = bodyText(await (await fetch(base + "/", { headers: { accept: "text/html" } })).text());
      h.check("the dev server: and rendered on the server as edited", /People in Directory/.test(again), again);
      h.check("the dev server: no console errors or warnings", h.problems.slice(from).length === 0, h.problems.slice(from));
    } finally { dev.kill(); writeFileSync(file, was); }
  },
};
