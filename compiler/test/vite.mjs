// `.rx` in Vite end to end: each example app built by Vite with plain `solid()` from @solidjs/vite-plugin, which finds
// this package (`@reactivescript/compiler/vite`) in the project, then driven in Chromium; and the todo app again under
// the dev server. Vite, solid-js and @solidjs/web come from the solid-next checkout (ref/SOLID_NEXT), as ref/ takes
// Solid. Solid's plugin needs built-in `.rx` (solid-vite-plugin PR, see README): SOLID_VITE_PLUGIN names a built
// checkout of it, else the one pnpm installed in solid-next. The Node-API build first: `npm run build` here,
// and the runtime's: `npm run build` in ../runtime.
// Usage: node compiler/test/vite.mjs [filter]   (SOLID_VITE_PLUGIN=dir picks the plugin; without it, the checkout's if it
// loads .rx, else npm's 3.0.1, installed once into .out)
import { readdirSync, mkdirSync, rmSync, symlinkSync, writeFileSync, cpSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = path.resolve(here, "..");
const repo = path.resolve(pkg, "..");
const store = path.resolve(process.env.SOLID_NEXT ?? path.resolve(repo, "../solid-next"), "node_modules/.pnpm")   // the checkout beside the repository, or $SOLID_NEXT (as ref/scripts/solid-next.sh);
const installed = path.join(store, readdirSync(store).filter(d => d.startsWith("@solidjs+vite-plugin@")).sort().pop(), "node_modules/@solidjs/vite-plugin");
// a plugin that loads `.rx` (it finds @reactivescript/compiler/vite): SOLID_VITE_PLUGIN, else the checkout's if it can,
// else npm's 3.0.1, installed once into .out
const loadsRx = dir => { try { return readFileSync(path.join(dir, "dist/esm/index.mjs"), "utf8").includes("@reactivescript/compiler/vite"); } catch { return false; } };
function npmPlugin() {
  const at = path.join(here, ".out/.plugin"), dir = path.join(at, "node_modules/@solidjs/vite-plugin");
  if (!loadsRx(dir)) { mkdirSync(at, { recursive: true }); execFileSync("npm", ["install", "--prefix", at, "--no-save", "--silent", "@solidjs/vite-plugin@3.0.1"], { stdio: "inherit" }); }
  return dir;
}
const pluginDir = process.env.SOLID_VITE_PLUGIN ? path.resolve(process.env.SOLID_VITE_PLUGIN) : loadsRx(installed) ? installed : npmPlugin();
const deps = path.resolve(installed, "../..");   // the installed plugin's node_modules: vite, solid-js, @solidjs/web
const vite = await import(pathToFileURL(path.join(deps, "vite/dist/node/index.js")).href);
const solid = (await import(pathToFileURL(path.join(pluginDir, "dist/esm/index.mjs")).href)).default;
const { chromium } = createRequire(import.meta.url)("playwright");
const runtime = path.join(repo, "runtime");   // @reactivescript/runtime, built (`npm run build` there)

// notes/ calls server functions: with no server behind the static build, it shows its own error boundary
const apps = {
  todo: "todo.rx", cart: "cart.rx", signup: "signup.rx", users: "users.rx", shop: "shop/main.rx", notes: "notes/main.rx",
  "ai-feed": "ai/feed.rx", "ai-grid": "ai/grid.rx", "ai-wizard": "ai/wizard.rx",
  "ai2-search": "ai2/search/main.rx", "ai2-settings": "ai2/settings/main.rx", "ai2-tracker": "ai2/tracker/main.rx",
  router: "router/main.rx",
  virtual: "virtual/main.rx", "virtual-headless": "virtual/headless.rx", query: "query/main.rx",
  primitives: "primitives/main.rx",
  tanstack: "tanstack/main.rx", "tanstack-factory": "tanstack-factory/main.rx",
};
const filter = process.argv[2];
const out = path.join(here, ".out"); mkdirSync(out, { recursive: true });

/** The npm packages an example needs (09 MO-11, MO-12, MO-10f/g, MO-11k), each packed once into .out and copied into the
 *  project, so their peers are the project's Solid. */
const PACKAGES = {
  router: ["@solidjs/router@2.0.0"],
  virtual: ["@tanstack/virtual-core@3.13.13"],
  query: ["@tanstack/solid-query@6.0.0-rc.6", "@tanstack/query-core@5.107.1"],
  // @tanstack/solid-router's Solid 2 line (2.0 rc), and what it depends on
  tanstack: ["@tanstack/solid-router@2.0.0-rc.11", "@solid-devtools/logger@0.9.11", "@solid-primitives/refs@1.1.4", "@solidjs/meta@0.29.8", "@tanstack/history@1.162.5", "@tanstack/router-core@1.171.39", "isbot@5.2.3", "@nothing-but/utils@0.17.0", "@solid-primitives/utils@6.4.1", "@solid-devtools/shared@0.20.0", "@solid-devtools/debugger@0.28.1", "cookie-es@3.1.1", "seroval@1.8.2", "seroval-plugins@1.8.0", "@solid-primitives/event-listener@2.4.6", "@solid-primitives/media@2.3.6", "@solid-primitives/rootless@1.5.4", "@solid-primitives/scheduled@1.5.3", "@solid-primitives/static-store@0.1.4", "@solid-primitives/styles@0.1.4", "@solid-primitives/bounds@0.1.7", "@solid-primitives/keyboard@1.3.7", "@solid-primitives/resize-observer@2.2.0"],
  // @solid-primitives' Solid 2.0 releases the app uses, and what they depend on
  primitives: ["@solid-primitives/media@4.0.0", "@solid-primitives/resize-observer@4.0.0", "@solid-primitives/active-element@3.0.0", "@solid-primitives/timer@1.4.5", "@solid-primitives/pagination@1.0.0", "@solid-primitives/scheduled@2.0.0", "@solid-primitives/event-listener@3.0.0", "@solid-primitives/keyed@3.0.0", "@solid-primitives/mouse@4.0.0", "@solid-primitives/storage@5.0.0", "@solid-primitives/rootless@2.0.0", "@solid-primitives/static-store@1.0.0", "@solid-primitives/utils@7.0.0"],
};
function packed(spec) {
  const cache = path.join(out, ".packages", spec.replace(/[@/]/g, "_")), dir = path.join(cache, "package");
  if (!existsSync(path.join(dir, "package.json"))) {
    mkdirSync(cache, { recursive: true });
    const tgz = execFileSync("npm", ["pack", spec, "--silent", "--pack-destination", cache], { encoding: "utf8" }).trim().split("\n").pop();
    execFileSync("tar", ["-xzf", path.join(cache, tgz), "-C", cache]);
  }
  return dir;
}

/** A Vite project around an example: its sources, a page, an entry that mounts the program over rt-web.ts. */
function project(name, entry) {
  const dir = path.join(out, name); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  // the project's node_modules: the plugin's (vite, solid-js, @solidjs/web) and this package, installed
  const nm = path.join(dir, "node_modules"); mkdirSync(path.join(nm, "@reactivescript"), { recursive: true });
  for (const d of readdirSync(deps)) {
    if (!d.startsWith("@")) { symlinkSync(path.join(deps, d), path.join(nm, d)); continue; }
    mkdirSync(path.join(nm, d), { recursive: true });
    for (const e of readdirSync(path.join(deps, d))) symlinkSync(path.join(deps, d, e), path.join(nm, d, e));
  }
  // the runtime's peers: solid-js and @solidjs/web are the plugin's; @solidjs/signals the one that solid-js runs on
  if (!existsSync(path.join(nm, "@solidjs/signals"))) symlinkSync(realpathSync(path.join(deps, "solid-js/node_modules/@solidjs/signals")), path.join(nm, "@solidjs/signals"));
  symlinkSync(pkg, path.join(nm, "@reactivescript/compiler"));
  // the runtime as installed: copied, so that it takes the project's Solid (a peer), not its own dev copy
  for (const f of ["package.json", "dist"]) cpSync(path.join(runtime, f), path.join(nm, "@reactivescript/runtime", f), { recursive: true });
  for (const spec of PACKAGES[name.split("-")[0]] ?? []) {
    const id = spec.slice(0, spec.lastIndexOf("@")); rmSync(path.join(nm, id), { recursive: true, force: true });
    mkdirSync(path.dirname(path.join(nm, id)), { recursive: true }); cpSync(packed(spec), path.join(nm, id), { recursive: true });
  }
  cpSync(path.join(repo, "examples"), path.join(dir, "src"), { recursive: true });
  if (TYPED.has(name)) {   // TY-1a: the build type-checks with rx-tsc, from the language server, over the app's tsconfig
    symlinkSync(path.join(repo, "tooling/rx-language-server"), path.join(nm, "@reactivescript/language-server"));
    writeFileSync(path.join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web", strict: true, noImplicitAny: false, target: "ES2022", module: "ESNext", moduleResolution: "Bundler", allowImportingTsExtensions: true, noEmit: true, skipLibCheck: true, lib: ["ES2022", "DOM"], types: [] }, include: [`src/${path.dirname(entry)}/**/*.rx`, `src/${path.dirname(entry)}/**/register.d.ts`] }, null, 2));
  }
  writeFileSync(path.join(dir, "src/entry.js"), `import { createApp } from "@reactivescript/runtime";\nimport main from "./${entry}";\nimport * as api from "./api.mjs";\nconst app = createApp({ root: document.getElementById("app"), api });\napp.mount(main(app));\n`);
  writeFileSync(path.join(dir, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><title>${name}</title></head><body><div id="app"></div><script type="module" src="/src/entry.js"></script></body></html>\n`);
  return dir;
}
/** The apps whose build type-checks (13 TY-1a); the rest build with RX_TYPECHECK=0. */
const TYPED = new Set(["router", "primitives", "tanstack", "tanstack-factory"]);
/** TanStack Router's Vite plugin (its file-based routing: the generator that writes routeTree.gen.ts), installed once into
 *  .out — a build tool, with no Solid of its own. `examples/tanstack` is built with it. */
const ROUTER_PLUGIN = "@tanstack/router-plugin@1.169.0";
async function routerPlugin() {
  const at = path.join(here, ".out/.router-plugin"), dir = path.join(at, "node_modules/@tanstack/router-plugin");
  if (!existsSync(path.join(dir, "package.json"))) { mkdirSync(at, { recursive: true }); execFileSync("npm", ["install", "--prefix", at, "--no-save", "--silent", "--legacy-peer-deps", ROUTER_PLUGIN], { stdio: "inherit" }); }
  return (await import(pathToFileURL(path.join(dir, "dist/esm/vite.js")).href)).tanstackRouter;
}
/** The plugins an app's own vite.config.ts names before `solid()` (examples/tanstack/vite.config.ts), for this project. */
const before = async (name, dir) => name === "tanstack" ? [(await routerPlugin())({ target: "solid", routesDirectory: path.join(dir, "src/tanstack/routes"), generatedRouteTree: path.join(dir, "src/tanstack/routeTree.gen.ts"), autoCodeSplitting: false, disableLogging: true })] : [];
const config = (dir, entry, plugins = []) => ({
  root: dir, configFile: false, logLevel: "warn", clearScreen: false,
  plugins: [...plugins, solid()],
  // the dev server polls for changes: what is tested is an edit reaching the page, not the platform's file events. On
  // macOS they report a project written just before the server started late, as a burst of changes, and an edit made
  // meanwhile is merged into the burst or never reported (plain Vite, no plugin, shows it): "styles (dev)" then failed
  // with the old colour, on most runs
  server: { watch: { usePolling: true, interval: 50 }, fs: { allow: [repo, path.dirname(deps), (process.env.SOLID_NEXT ?? path.resolve(repo, "../solid-next")), pluginDir] } },
  optimizeDeps: { force: true },   // the dev server's prebundled deps are rebuilt every run: a Solid repin never meets a stale cache
  build: { outDir: "dist", sourcemap: true, emptyOutDir: true },
});

const browser = await chromium.launch();
let pass = 0, fail = 0;
async function drive(name, url, check) {
  const page = await browser.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  try {
    await page.goto(url); await page.waitForTimeout(900);
    const text = (await page.textContent("#app"))?.replace(/\s+/g, " ").trim() ?? "";
    if (!text) throw new Error("nothing rendered");
    if (check) await check(page);
    if (errors.length) throw new Error(errors.join(" | "));
    pass++; console.log(`✓ ${name}: ${text.slice(0, 90)}`);
  } catch (e) { fail++; console.log(`✗ ${name}: ${e.message}`); }
  finally { await page.close(); }
}
const todo = async page => {
  await page.fill("input[placeholder]", "milk"); await page.click("text=Add"); await page.waitForTimeout(100);
  const t1 = await page.textContent("#app"); if (!t1.includes("milk") || !t1.includes("1 left")) throw new Error(`after add: ${t1}`);
  await page.click("input[type=checkbox]"); await page.waitForTimeout(100);
  const t2 = await page.textContent("#app"); if (!t2.includes("0 left")) throw new Error(`after toggle: ${t2}`);
};

const router = async page => {
  const h1 = async () => (await page.textContent("h1"))?.trim();
  const app = async () => (await page.textContent("#app")).replace(/\s+/g, " ");
  const until = async (what, ok) => { for (let i = 0; i < 40; i++) { if (await ok()) return; await page.waitForTimeout(50); } throw new Error(`${what}: ${await app()} at ${page.url()}`); };
  await page.evaluate(() => { window.__loaded = true; });
  if ((await h1()) !== "People") throw new Error(`home: ${await app()}`);
  await page.click("nav >> text=Ann"); await until("after the Ann link", async () => (await h1()) === "Ann" && (await app()).includes("engineer, #1"));
  if (!page.url().endsWith("/people/1")) throw new Error(`url ${page.url()}`);
  // the router's data layer: a form action bound to a form, its settled submission's result, the query revalidated
  await page.click("text=Promote");
  await until("the action's result, and the query revalidated after it", async () => (await app()).includes("lead engineer, #1") && (await app()).includes("Ann promoted"));
  await page.click("nav >> text=Bo"); await until("after the Bo link (same route, new param)", async () => (await h1()) === "Bo" && (await app()).includes("designer, #2"));
  await page.click("nav >> text=Home"); await until("back home", async () => (await h1()) === "People");
  await page.click("text=Meet Bo"); await until("after navigate()", async () => (await h1()) === "Bo" && page.url().endsWith("/people/2"));
  await page.click("nav >> text=Nobody"); await until("an unknown id", async () => (await app()).includes("no person 9"));
  await page.goBack(); await until("history back", async () => (await h1()) === "Bo");
  if (!(await page.evaluate(() => window.__loaded))) throw new Error("the page reloaded");
};

const until = async (page, what, ok) => { for (let i = 0; i < 60; i++) { if (await ok()) return; await page.waitForTimeout(50); } throw new Error(`${what}: ${(await page.textContent("#app")).replace(/\s+/g, " ").slice(0, 200)}`); };
const virtual = async page => {   // MO-11k: render props, a named one, and an .rx source the rows read
  const rows = () => page.$$eval(".vrow button", bs => bs.map(x => x.textContent));
  await until(page, "the rows in view, of 10,000", async () => { const r = await rows(); return r.length > 5 && r.length < 20 && r[0] === "row 0"; });
  await page.click(".vrow button >> text=row 3"); await until(page, "a click in a row", async () => (await rows()).includes("row 3 ✓") && (await page.textContent("#head")) === "10000 rows, picked 3");
  await page.$eval(".vlist", el => { el.scrollTop = 30 * 5000; }); await until(page, "scrolled to row 5,000", async () => (await rows()).includes("row 5000"));
};
const headless = async page => {   // 07 §4 `ref`: the element reaches the virtualizer
  const rows = () => page.$$eval(".vrow", rs => rs.map(x => x.textContent));
  await until(page, "the rows in view", async () => { const r = await rows(); return r.length > 5 && r.length < 20 && r[0] === "row 0"; });
  await page.click("#jump"); await until(page, "scrollToIndex from a handler", async () => (await rows()).includes("row 7000"));
};
const query = async page => {   // MO-12, MO-10f, MO-10g: a query, a mutation whose onSuccess writes a source
  await until(page, "the query's data", async () => (await page.textContent("#app")).includes("milkeggs"));
  await page.fill("input", "bread"); await page.click("text=add");
  await until(page, "the mutation, its onSuccess and the refetch", async () => { const t = await page.textContent("#app"); return t.includes("milkeggsbread") && t.includes("saved 1"); });
};
// @solid-primitives from .rx: each primitive's value reaches the page and follows what it tracks
const primitives = async page => {
  const t = async sel => ((await page.textContent(sel)) ?? "").replace(/\s+/g, " ").trim();
  const until = async (what, ok) => { for (let i = 0; i < 40; i++) { if (await ok()) return; await page.waitForTimeout(50); } throw new Error(`${what}: ${(await page.textContent("#app")).replace(/\s+/g, " ")}`); };
  await until("a media query and the window's size", async () => /^wide 1280x720$/.test(await t("#media")));
  await until("an interval counter", async () => (await t("#ticks")) === "ticking");
  if ((await t("#items")) !== "onetwothree") throw new Error(`keyed list: ${await t("#items")}`);
  await page.click("#search"); await until("the active element", async () => (await t("#active")) === "focus: INPUT");
  await page.keyboard.type("milk"); await until("a debounced callback writing a source", async () => (await t("#query")) === "query: milk");
  await until("a window event listener's handler", async () => (await t("#key")) === "key: k");
  await page.click("#next"); await until("a pagination tuple", async () => (await t("#page")) === "page 2 of 5");
  await page.mouse.move(40, 30); await until("the mouse position store", async () => (await t("#mouse")) === "mouse 40,30");
  await page.click("#theme"); await until("a persisted signal", async () => (await t("#theme")) === "theme: dark");
  if ((await page.evaluate(() => localStorage.getItem("theme"))) !== JSON.stringify("dark")) throw new Error(`persisted: ${await page.evaluate(() => localStorage.getItem("theme"))}`);
};
// @tanstack/solid-router from .rx — its file routes around .rx pages (examples/tanstack), and a route tree given to the
// app's own factory (examples/tanstack-factory): links, a param, navigate, a failing page's typed boundary in its layout
const tanstack = async page => {
  const h1 = async () => (await page.textContent("h1"))?.trim();
  const app = async () => (await page.textContent("#app")).replace(/\s+/g, " ");
  const until = async (what, ok) => { for (let i = 0; i < 40; i++) { if (await ok()) return; await page.waitForTimeout(50); } throw new Error(`${what}: ${await app()} at ${page.url()}`); };
  await page.evaluate(() => { window.__loaded = true; });
  if ((await h1()) !== "People") throw new Error(`home: ${await app()}`);
  await page.click("nav >> text=Ann"); await until("after the Ann link", async () => (await h1()) === "Ann" && (await app()).includes("engineer, #1"));
  if (!page.url().endsWith("/people/1")) throw new Error(`url ${page.url()}`);
  await page.click("nav >> text=Bo"); await until("after the Bo link (same route, new param)", async () => (await h1()) === "Bo" && (await app()).includes("designer, #2"));
  await page.click("nav >> text=Home"); await until("back home", async () => (await h1()) === "People");
  await page.click("text=Meet Bo"); await until("after navigate()", async () => (await h1()) === "Bo" && page.url().endsWith("/people/2"));
  await page.click("nav >> text=Nobody"); await until("an unknown id, its typed boundary", async () => (await app()).includes("no person 9"));
  if (!(await page.evaluate(() => window.__loaded))) throw new Error("a link reloaded the page");
};
const drivers = { todo, router, virtual, "virtual-headless": headless, query, primitives, tanstack: async page => { await tanstack(page); await page.click("nav >> text=Home"); if (!(await page.textContent("#app")).includes("of the directory")) throw new Error(`what the app's entry provides above the router: ${await page.textContent("#app")}`); }, "tanstack-factory": tanstack };

for (const [name, entry] of Object.entries(apps)) {
  if (filter && !name.includes(filter)) continue;
  let dir;
  process.env.RX_TYPECHECK = TYPED.has(name) ? "1" : "0";
  let plugins = [];
  try { dir = project(name, entry); plugins = await before(name, dir); await vite.build(config(dir, entry, plugins)); }
  catch (e) { fail++; console.log(`✗ ${name}: build: ${e.message.split("\n").slice(0, 8).join(" | ")}`); continue; }
  // CP-1c: the bundle's map reaches the .rx sources
  const maps = readdirSync(path.join(dir, "dist/assets")).filter(f => f.endsWith(".js.map"));
  const sources = maps.flatMap(f => JSON.parse(readFileSync(path.join(dir, "dist/assets", f), "utf8")).sources);
  if (!sources.some(s => s.endsWith(".rx"))) { fail++; console.log(`✗ ${name}: the bundle's source map names no .rx file`); continue; }
  const dist = path.join(dir, "dist");
  const http = createServer((req, res) => { let f = path.join(dist, req.url === "/" ? "index.html" : req.url.split("?")[0]); if (!existsSync(f) && (name === "router" || name.startsWith("tanstack")) && !path.extname(f)) f = path.join(dist, "index.html"); if (!existsSync(f)) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html"); res.end(readFileSync(f)); });   // router/: a page's URL serves the app
  await new Promise(r => http.listen(0, "127.0.0.1", r));
  await drive(`${name} (build)`, `http://127.0.0.1:${http.address().port}/`, drivers[name]);
  if (name === "router") {   // TY-1a: a route whose path lacks the param its page needs fails the build, on its line
    const routes = path.join(dir, "src/router/routes.rx");
    writeFileSync(routes, readFileSync(routes, "utf8").replace('path: "/people/:id"', 'path: "/people"'));
    try { await vite.build(config(dir, entry)); fail++; console.log("✗ router (typed build): a route missing its page's param built"); }
    catch (e) { if (/TS2\d+/.test(e.message) && /routes\.rx/.test(e.message)) { pass++; console.log(`✓ router (typed build): refused, ${e.message.split("\n").find(l => /routes\.rx/.test(l)).trim().slice(0, 90)}`); } else { fail++; console.log(`✗ router (typed build): ${e.message.split("\n").slice(0, 3).join(" | ")}`); } }
    cpSync(path.join(repo, "examples/router/routes.rx"), routes);
  }
  if (name === "tanstack") {   // the generated route tree registers the router: a link to no route in an .rx page fails the typed build, on its line
    const pages = path.join(dir, "src/tanstack/pages.rx");
    writeFileSync(pages, readFileSync(pages, "utf8").replace('<Link to="/">Home</Link>', '<Link to="/home">Home</Link>'));
    try { await vite.build(config(dir, entry, plugins)); fail++; console.log("✗ tanstack (typed build): a link to no route built"); }
    catch (e) { if (/TS2\d+/.test(e.message) && /pages\.rx/.test(e.message)) { pass++; console.log(`✓ tanstack (typed build): a link to no route refused, ${e.message.split("\n").find(l => /TS2\d+/.test(l)).trim().slice(0, 100)}`); } else { fail++; console.log(`✗ tanstack (typed build): ${e.message.split("\n").slice(0, 3).join(" | ")}`); } }
    cpSync(path.join(repo, "examples/tanstack/pages.rx"), pages);
    // 09 MO-14: the host's declaration places the pages in the layout, at its outlet — without the layout's region, a page's failure is refused
    writeFileSync(pages, readFileSync(pages, "utf8").replace(/  errored fallback\(e: NotFound\) \{[^\n]*\n    (<main><Outlet \/><\/main>)\n  \}\n/, "  $1\n"));
    try { await vite.build(config(dir, entry, plugins)); fail++; console.log("✗ tanstack (host declaration): a page's failure with no region around the layout's outlet built"); }
    catch (e) { if (/UNHANDLED_FAILURE/.test(e.message) && /host\.d\.rx/.test(e.message)) { pass++; console.log("✓ tanstack (host declaration): a page's failure with no region around the layout's outlet is refused, on host.d.rx"); } else { fail++; console.log(`✗ tanstack (host declaration): ${e.message.split("\n").slice(0, 3).join(" | ")}`); } }
    cpSync(path.join(repo, "examples/tanstack/pages.rx"), pages);
  }
  if (name === "tanstack-factory") {   // TY-1d through the app's own factory (tsr.d.ts types the route tree): a route record without its component fails the build
    const main = path.join(dir, "src/tanstack-factory/main.rx");
    writeFileSync(main, readFileSync(main, "utf8").replace('{ path: "/", component: Home },', '{ path: "/" },'));
    try { await vite.build(config(dir, entry)); fail++; console.log("✗ tanstack-factory (typed build): a route record with no component built"); }
    catch (e) { if (/TS2\d+/.test(e.message) && /main\.rx/.test(e.message)) { pass++; console.log(`✓ tanstack-factory (typed build): refused, ${e.message.split("\n").find(l => /TS2\d+/.test(l)).trim().slice(0, 100)}`); } else { fail++; console.log(`✗ tanstack-factory (typed build): ${e.message.split("\n").slice(0, 3).join(" | ")}`); } }
    cpSync(path.join(repo, "examples/tanstack-factory/main.rx"), main);
  }
  if (name === "router") await drive("router (build, a page's URL)", `http://127.0.0.1:${http.address().port}/people/2`, async page => { await page.waitForTimeout(300); const t = await page.textContent("h1"); if (t?.trim() !== "Bo") throw new Error(`/people/2 loaded: ${await page.textContent("#app")}`); });
  http.close();
}
process.env.RX_TYPECHECK = "0";
if (!filter || "host".includes(filter)) {   // CP-4d: a JS host (TSX, Solid's own render) uses .rx components, imported ?rx-lib
  const dir = project("host", "host/main.tsx");
  writeFileSync(path.join(dir, "index.html"), readFileSync(path.join(dir, "index.html"), "utf8").replace("/src/entry.js", "/src/host/main.tsx"));
  try {
    await vite.build(config(dir, "host/main.tsx"));
    const dist = path.join(dir, "dist");
    const http = createServer((req, res) => { const f = path.join(dist, req.url === "/" ? "index.html" : req.url.split("?")[0]); if (!existsSync(f)) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html"); res.end(readFileSync(f)); });
    await new Promise(r => http.listen(0, "127.0.0.1", r));
    await drive("host (TSX renders .rx components)", `http://127.0.0.1:${http.address().port}/`, async page => {
      const app = async () => (await page.textContent("#app")).replace(/\s+/g, " ");
      const until = async (what, ok) => { for (let i = 0; i < 40; i++) { if (await ok()) return; await page.waitForTimeout(50); } throw new Error(`${what}: ${await app()}`); };
      await until("the .rx data, and its typed boundary", async () => (await app()).includes("Annengineer") && (await app()).includes("no person 9"));
      await page.click("button.counter >> nth=0"); await page.click("button.counter >> nth=1");
      await until("one .rx source behind both components", async () => (await app()).includes("clicks: 2") && (await app()).includes("same clicks: 2"));
    });
    http.close();
  } catch (e) { fail++; console.log(`✗ host: ${e.message.split("\n").slice(0, 4).join(" | ")}`); }
}
if (!filter || "router-ssr".includes(filter)) {   // SV-4a through Vite: a client and a server build of the router app, served per request and hydrated
  const dir = project("router-ssr", "router/main.rx");
  writeFileSync(path.join(dir, "src/entry.js"), `import { createApp } from "@reactivescript/runtime";\nimport main from "./router/main.rx";\nconst app = createApp({ root: document.getElementById("app") });\napp.mount(main(app), true);\nwindow.__hydrated = true;\n`);
  writeFileSync(path.join(dir, "src/server.js"), `import { createApp, generateHydrationScript } from "@reactivescript/runtime";\nimport main from "./router/main.rx";\nexport { generateHydrationScript };\n/** One request: its own app (SV-4), rendering for its URL (SV-4a). */\nexport function render(request, sink) { const app = createApp({ request }); app.stream(main(app), sink); }\n`);
  // Solid, the router and the runtime stay external on the server, as installed packages are: one copy each (the suite
  // links Solid from the solid-next checkout, which Vite would otherwise bundle, beside the runtime's own import of it)
  const ssrConfig = (build) => ({ ...config(dir, "router/main.rx"), plugins: [solid({ ssr: true })], ssr: { external: ["solid-js", "@solidjs/web", "@solidjs/signals", "@solidjs/router", "@reactivescript/runtime"] }, build: { sourcemap: true, emptyOutDir: true, ...build } });
  try {
    await vite.build(ssrConfig({ outDir: "dist/client" }));
    await vite.build(ssrConfig({ outDir: "dist/server", ssr: "src/server.js" }));
    const server = await import(pathToFileURL(path.join(dir, "dist/server/server.mjs")).href);
    const page = readFileSync(path.join(dir, "dist/client/index.html"), "utf8");
    const [head, tail] = page.replace("</head>", `${server.generateHydrationScript()}</head>`).split('<div id="app"></div>');
    const http = createServer((req, res) => {
      const f = path.join(dir, "dist/client", req.url.split("?")[0]);
      if (req.url.startsWith("/assets/") && existsSync(f)) { res.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : "text/css"); return res.end(readFileSync(f)); }
      res.setHeader("content-type", "text/html"); res.write(`${head}<div id="app">`);
      let first = true;
      server.render(new Request(`http://localhost${req.url}`), { write: s => { res.write(s); if (first) { first = false; res.write("</div>"); } }, end: () => res.end(tail) });
    });
    await new Promise(r => http.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${http.address().port}`;
    await drive("router (ssr build, /people/2 served and hydrated)", `${base}/people/2`, async page => {
      await page.waitForFunction(() => window.__hydrated, null, { timeout: 5000 });
      await page.waitForTimeout(400);
      const t = await page.textContent("h1"); if (t?.trim() !== "Bo") throw new Error(`/people/2: ${await page.textContent("#app")}`);
      await page.evaluate(() => { window.__same = true; });
      await page.click("a[href='/people/1']"); await page.waitForTimeout(700);
      if ((await page.textContent("h1"))?.trim() !== "Ann" || !(await page.evaluate(() => window.__same))) throw new Error(`after a click: ${await page.textContent("#app")}`);
    });
    await drive("router (ssr build, /people/9: NotFound across the wire)", `${base}/people/9`, async page => {
      await page.waitForFunction(() => window.__hydrated, null, { timeout: 5000 }); await page.waitForTimeout(600);
      const t = await page.evaluate(() => document.querySelector("p.missing")?.textContent); if (t !== "no person 9") throw new Error(`/people/9: ${await page.textContent("#app")}`);
    });
    http.close();
  } catch (e) { fail++; console.log(`✗ router (ssr build): ${e.message.split("\n").slice(0, 4).join(" | ")}`); }
}
if (!filter || "shared".includes(filter)) {   // two programs on one page, sharing shop/catalog.rx: no entry option, one catalog module
  const dir = project("shared", "shop/main.rx");
  writeFileSync(path.join(dir, "src/shop/count.rx"), `import { products } from "./catalog.rx"\n\nexport default component Count() {\n  errored fallback(e) { <p>no catalogue</p> } {\n    <p>{len(products)} products</p>\n  }\n}\n`);
  writeFileSync(path.join(dir, "src/entry.js"), `import { createApp } from "@reactivescript/runtime";\nimport shop from "./shop/main.rx";\nimport count from "./shop/count.rx";\nimport * as api from "./api.mjs";\nfor (const [main, el] of [[shop, "app"], [count, "app2"]]) { const app = createApp({ root: document.getElementById(el), api }); app.mount(main(app)); }\n`);
  writeFileSync(path.join(dir, "index.html"), readFileSync(path.join(dir, "index.html"), "utf8").replace('<div id="app"></div>', '<div id="app"></div><div id="app2"></div>'));
  try {
    const bundle = await vite.build(config(dir, "shop/main.rx"));
    const ids = (Array.isArray(bundle) ? bundle : [bundle]).flatMap(b => b.output.flatMap(o => Object.keys(o.modules ?? {})));
    const catalogs = ids.filter(m => m.includes("catalog.rx"));
    if (catalogs.length !== 1) throw new Error(`catalog.rx bundled as ${JSON.stringify(catalogs)}`);
    const dist = path.join(dir, "dist");
    const http = createServer((req, res) => { const f = path.join(dist, req.url === "/" ? "index.html" : req.url.split("?")[0]); if (!existsSync(f)) { res.statusCode = 404; return res.end(); } res.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "text/html"); res.end(readFileSync(f)); });
    await new Promise(r => http.listen(0, "127.0.0.1", r));
    await drive("shared (build)", `http://127.0.0.1:${http.address().port}/`, async page => {
      const t = await page.textContent("#app2"); if (!/3 products/.test(t)) throw new Error(`second program: ${t}`);
    });
    http.close();
  } catch (e) { fail++; console.log(`✗ shared: ${e.message.split("\n").slice(0, 6).join(" | ")}`); }
}
if (!filter || "todo".includes(filter)) {   // the dev server: modules transformed on request
  const dir = project("todo-dev", "todo.rx");
  const server = await vite.createServer(config(dir, "todo.rx")); await server.listen(0);
  await drive("todo (dev)", server.resolvedUrls.local[0], todo);
  await server.close();
}
if (!filter || "styles".includes(filter)) {   // CSS-4 under the dev server: a dependency's <style> edit reaches the page
  const dir = project("styles-dev", "styled/main.rx");
  mkdirSync(path.join(dir, "src/styled"));
  writeFileSync(path.join(dir, "src/styled/main.rx"), `import { Badge } from "./badge.rx"\n\nexport default component Main() {\n  <main><Badge /></main>\n}\n`);
  const badge = path.join(dir, "src/styled/badge.rx");
  const style = color => `export component Badge() {\n  <style>\n    .badge { color: ${color} }\n  </style>\n  <p class="badge">badge</p>\n}\n`;
  writeFileSync(badge, style("rgb(0, 0, 255)"));
  const server = await vite.createServer(config(dir, "styled/main.rx")); await server.listen(0);
  const url = server.resolvedUrls.local[0];
  const color = page => page.$eval(".badge", e => getComputedStyle(e).color);
  const until = async (page, want, what) => {
    for (let i = 0; i < 40 && await color(page).catch(() => "") !== want; i++) await page.waitForTimeout(100);
    const got = await color(page).catch(e => e.message.split("\n")[0]); if (got !== want) throw new Error(`${what}: color ${got}, not ${want}`);
  };
  await drive("styles (dev)", url, async page => {
    await until(page, "rgb(0, 0, 255)", "first load");
    writeFileSync(badge, style("rgb(255, 0, 0)"));
    await until(page, "rgb(255, 0, 0)", "after the edit");
    await page.reload(); await until(page, "rgb(255, 0, 0)", "after a reload");
    const fresh = await browser.newPage();
    try { await fresh.goto(url); await until(fresh, "rgb(255, 0, 0)", "in a new page"); } finally { await fresh.close(); }
  });
  await server.close();
}
if (!filter || "cold".includes(filter)) {   // a dependency asked for before its entry, as Vitest's `fsModuleCache` leaves it
  const { default: rx } = await import(pathToFileURL(path.join(pkg, "vite.mjs")).href);
  const root = project("cold", "shop/main.rx"), catalog = path.join(root, "src/shop/catalog.rx");
  const ctx = (id, moduleId) => ({ id, moduleId, root, ssr: false, solid: { generate: "dom", hydratable: false }, addWatchFile() {} });
  try {
    // a commented-out import is not an edge: read as one, it would make main.rx look imported and leave no entry
    writeFileSync(catalog, readFileSync(catalog, "utf8") + `\n// import { x } from "./main.rx"\n`);
    const warm = rx(); warm.compile("", ctx(path.join(root, "src/shop/main.rx"), path.join(root, "src/shop/main.rx")));
    const want = warm.compile("", ctx(catalog, `${catalog}?rx-dep`)).code;
    const got = rx().compile("", ctx(catalog, `${catalog}?rx-dep`)).code;
    if (got !== want) throw new Error("the dependency compiled cold differs from the one compiled after its entry");
    writeFileSync(catalog, readFileSync(catalog, "utf8") + "\nexport bad = missingName\n");
    let report = "";
    try { rx().compile("", ctx(catalog, `${catalog}?rx-dep`)); } catch (e) { report = e.message; }
    if (!/catalog\.rx:\d+(:\d+)?: error /.test(report)) throw new Error(`a cold dependency that does not compile reports ${JSON.stringify(report.slice(0, 200))}`);
    pass++; console.log("✓ cold dependency: compiled from the program that holds it, or that program's diagnostics");
  } catch (e) { fail++; console.log(`✗ cold dependency: ${e.message.split("\n")[0]}`); }
}
await browser.close();
console.log(`\n${pass} pass, ${fail} fail (vite ${vite.version}, @solidjs/vite-plugin ${JSON.parse(readFileSync(path.join(pluginDir, "package.json"), "utf8")).version})`);
process.exit(fail ? 1 : 0);
