// A TanStack Router app whose route files are `.rx`: each file of src/routes is its route's component, and the
// router's generator writes the route objects itself (src/routeTree.gen.ts imports each file's default component as a
// page, `?rx-page`). No TSX stand-in: this is file-based routing as the router's users write it, in `.rx`. The tree
// types every link and hook of the pages; host.d.rx says what the router does with them (09 MO-14).
// The generator's option (`routeComponentExtensions`) is a fork's, not yet upstream: vendor/README.md says which
// commit, how it was built, and why the two packages are committed as tarballs. With upstream's generator a route file
// is a few lines of TSX that hand the route a component (bench/tasks/router-provider: the fallback).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = "src/routes/__root.rx", HOME = "src/routes/index.rx", PERSON = "src/routes/people.$id.rx";
const REGIONS = "errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } { <Frame /> }";
const PAGE_FRAME = "src/frame.rx";   // the app's frame around the router's <Outlet />, a module away from the layout that applies it (09 MO-14f)
const FRAME = '<Shell title="Directory"><AppRouter /></Shell>';
const vite = dir => path.join(dir, "../../node_modules/vite/bin/vite.js");
const listening = child => new Promise((resolve, reject) => { child.stdout.on("data", d => { const m = /listening (\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); }); child.on("exit", c => reject(new Error(`server exited ${c}`))); });
export default {
  title: "TanStack Router: `.rx` route files (the generator's routeComponentExtensions, a fork), typed by the generated tree, the router in the app's component",
  entries: ["src/main.rx", ROOT, HOME, PERSON],
  spa: true,    // a client-only build
  host: true,   // the generated tree imports each route file's page (?rx-page): JS applies them, where src/host.d.rx says
  // the build first: the router's plugin writes the route tree the routes are typed by, before any checker reads the program
  prepare(dir) { execFileSync(process.execPath, [vite(dir), "build"], { cwd: dir, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, RX_TYPECHECK: "0" } }); },
  types: [
    { name: "a link to no route is refused (the generated route tree)", file: ROOT, edit: ['<Link to="/">Home</Link>', '<Link to="/home">Home</Link>'], expect: /TS2322|TS2820/ },
    { name: "useParams' `from` is a route of the tree", file: PERSON, edit: ['useParams({ from: "/people/$id" })', 'useParams({ from: "/person/$id" })'], expect: /TS2322|TS2820|TS2345/ },
    { name: "a link without the param its route needs", file: ROOT, edit: [' params={{ id: "1" }}', ""], expect: /TS2741|TS2322|TS2739/ },
    { name: "the answer keeps the backend's type in the page", file: PERSON, edit: ["<p>{person.role}, #{params.id}</p>", "<p>{person.rank}, #{params.id}</p>"], expect: /TS2339/ },
  ],
  bad: [
    { name: "a page that can fail, with no errored region around the layout's frame (the outlet is in it)", file: ROOT, entry: ROOT, edit: [REGIONS, "<Frame />"], expect: "UNHANDLED_FAILURE" },
    { name: "a router hook called outside the provider (in the app, above the Shell)", edit: ["export default component App() {\n", "export default component App() {\n  where = useParams({ from: \"/people/$id\" })\n"], edit2: ['import { AppRouter } from "./router.tsx"', 'import { AppRouter } from "./router.tsx"\nimport { useParams } from "@tanstack/solid-router"'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a link beside the router, in the app's frame (it reads the router's context)", edit: [FRAME, '<Shell title="Directory"><Link to="/">Home</Link><AppRouter /></Shell>'], edit2: ['import { AppRouter } from "./router.tsx"', 'import { AppRouter } from "./router.tsx"\nimport { Link } from "@tanstack/solid-router"'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a route file's page applied by hand as well as routed, outside the router", edit: [FRAME, `${FRAME}\n  <Person />`], edit2: ['import { AppRouter } from "./router.tsx"', 'import { AppRouter } from "./router.tsx"\nimport { Person } from "./routes/people.$id.rx"'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a client-only build with no loading above a page that waits (the frame's region, around its outlet)", file: PAGE_FRAME, entry: ROOT, edit: ["loading fallback { <p>loading…</p> } { <main><Outlet /></main> }", "<main><Outlet /></main>"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
    { name: "the frame's outlet beside its region, not in it", file: PAGE_FRAME, entry: ROOT, edit: ["loading fallback { <p>loading…</p> } { <main><Outlet /></main> }", "loading fallback { <p>loading…</p> } { <p>ready</p> }\n  <main><Outlet /></main>"], expect: "ASYNC_OUTSIDE_LOADING_BOUNDARY" },
    { name: "the app's provision removed: a route file under the router reads it", edit: ['  provide team = { name: "Directory" }\n', ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "the layout's frame beside its region, not in it", file: ROOT, entry: ROOT, edit: [REGIONS, 'errored fallback(e: NotFound) { <p class="missing">{e.message}</p> } { <p>ready</p> }\n  <Frame />'], expect: "UNHANDLED_FAILURE" },
    { name: "the frame renders no outlet: the root route's pages would never show", file: PAGE_FRAME, entry: ROOT, edit: ["<main><Outlet /></main>", "<main>no pages</main>"], expect: "NESTED_NOT_RENDERED" },
    { name: "the root route applies a component that renders its own children, given none, and no frame: no outlet either", file: ROOT, entry: ROOT, edit: ["{ <Frame /> }", "{ <Shell title=\"none\" /> }"], edit2: ['import { Frame } from "../frame.rx"', 'import { Shell } from "../shell.rx"'], expect: "NESTED_NOT_RENDERED" },
    // the declaration is derived from the generated tree (`//@ routes`, 09 MO-14g): one that falls behind is refused
    { name: "a route file added, and the host's declaration not written again: the build refuses the stale one", add: ["src/routes/about.rx", "export default component About() {\n  <h1>About</h1>\n}\n"], build: /HOST_VIEW_STALE[\s\S]*About is a route/ },
    { name: "the host's declaration edited by hand: a page taken out of the root route's children", file: "src/host.d.rx", edit: ["{ component: Root, children: [{ component: Home }, { component: Person }] }", "{ component: Root, children: [{ component: Home }] }, { component: Person }"], gate: /HOST_VIEW_STALE.*Person is among Root's children/ },
    { name: "a page's own failure, a class the layout's region does not take", file: PERSON, entry: PERSON, edit: ["person = await fetchPerson(params.id)\n  <h1>{person.name}</h1>", "person = await fetchPerson(params.id)\n  stamp = await fetchStamp(params.id)\n  <h1>{person.name} {stamp}</h1>"], edit2: ['import { fetchPerson } from "../people.js"', 'import { fetchPerson, fetchStamp } from "../people.js"'], expect: "UNHANDLED_FAILURE" },
  ],
  async run(h) {
    const server = spawn(process.execPath, ["serve.mjs"], { cwd: h.dir, env: { ...process.env, PORT: "0" } });
    try {
      const port = await listening(server);
      const page = await h.page();
      await page.goto(`http://127.0.0.1:${port}/people/1`);
      h.check("the Shell's header, and the route file's page for the URL", await h.until(async () => /Directory.*Ann.*engineer, #1/.test(await h.text(page))), await h.text(page));
      await page.click("a[href='/people/9']");
      h.check("a route file's NotFound shows at the root route's typed region", await h.until(async () => /no person 9/.test(await h.text(page))), await h.text(page));
      await page.click("a[href='/']");
      h.check("navigation on the client, to a route file that reads what the app's entry provides above the router", await h.until(async () => /People of Directory/.test(await h.text(page)) && !/no person/.test(await h.text(page))), await h.text(page));
      h.check("no console errors or warnings", h.problems.length === 0, h.problems);
      await page.close();
      // the declaration itself, run: rx-verify renders the probe's scene (host.probe.mjs) and holds the view to it
      const v = spawnSync(process.execPath, ["--conditions=browser", path.join(h.dir, "../../node_modules/@reactivescript/language-server/bin/verify.js"), "--dom", "src/host.d.rx"], { cwd: h.dir, encoding: "utf8" });
      h.check("rx-verify: the host's declaration holds where it is run (each route file inside the root route, rendered through the router's component and the outlet)", (v.stdout.match(/ ok /g) ?? []).length === 3 && !/MISMATCH|unverified/.test(v.stdout), v.stdout + v.stderr);
    } finally { server.kill(); }
    // the dev server (11 CP-4b): an edit of a route file is shown, and what the app's entry provides is still there —
    // the context is declared in a module the entry and the route file both import, which the dev server serves again
    // under a new URL after the edit (twice, in Vite 8: its two spellings of one query)
    const dev = spawn(process.execPath, ["dev.mjs"], { cwd: h.dir, env: process.env });
    const home = path.join(h.dir, HOME), person = path.join(h.dir, PERSON), was = [readFileSync(home, "utf8"), readFileSync(person, "utf8")];
    try {
      const port = await listening(dev);
      const from = h.problems.length;
      const page = await h.page();
      await page.goto(`http://127.0.0.1:${port}/`);
      h.check("the dev server: the index route file's page, under the app's provision", await h.until(async () => /People of Directory/.test(await h.text(page)), 300), await h.text(page));
      writeFileSync(home, was[0].replace("People of", "People in"));
      h.check("the dev server: an edited route file is shown, and still reads the app's context (one module, served under two URLs)", await h.until(async () => /People in Directory/.test(await h.text(page)), 300), `${await h.text(page)} ${h.problems.slice(from).join(" | ")}`);
      await page.reload();
      h.check("the dev server: and after a reload of the page", await h.until(async () => /People in Directory/.test(await h.text(page)), 300), `${await h.text(page)} ${h.problems.slice(from).join(" | ")}`);
      await page.click("a[href='/people/1']");
      h.check("the dev server: navigation to the page with a param", await h.until(async () => /Ann.*engineer, #1/.test(await h.text(page)), 300), await h.text(page));
      writeFileSync(person, was[1].replace("{person.role},", "{person.role} here,"));
      h.check("the dev server: that route file edited, shown at its URL", await h.until(async () => /engineer here, #1/.test(await h.text(page)), 300), `${await h.text(page)} ${h.problems.slice(from).join(" | ")}`);
      // a route file added while the server runs: the router writes its tree again, and the plugin the declaration (MO-14g)
      const about = path.join(h.dir, "src/routes/about.rx"), host = path.join(h.dir, "src/host.d.rx"), hostWas = readFileSync(host, "utf8");
      try {
        writeFileSync(about, 'import { team } from "../team.rx"\n\nexport default component About() {\n  t = use team\n  <h1>About {t.name}</h1>\n}\n');
        // (once the server serves the tree with the route in it: the page is not sent to a URL it has no route for yet)
        const served = async () => (await (await fetch(`http://127.0.0.1:${port}/src/routeTree.gen.ts`)).text()).includes("about.rx");
        await h.until(served, 300);
        await page.goto(`http://127.0.0.1:${port}/about`);
        h.check("the dev server: a route file added is routed, under the app's provision", await h.until(async () => /About Directory/.test(await h.text(page)), 300), `${await h.text(page)} ${h.problems.slice(from).join(" | ")}`);
        h.check("the dev server: and the host's declaration is written again from the tree, with the new route in it", await h.until(() => /\{ component: About \}/.test(readFileSync(host, "utf8")), 100), readFileSync(host, "utf8"));
        await page.goto(`http://127.0.0.1:${port}/`);
        h.check("the dev server: back at the index route", await h.until(async () => /People in Directory/.test(await h.text(page)), 300), await h.text(page));
        await page.close();   // before the route file goes: an open page would be reloaded at a URL that has no route again
      } finally { rmSync(about, { force: true }); await h.until(() => !readFileSync(path.join(h.dir, "src/routeTree.gen.ts"), "utf8").includes("about.rx"), 300); writeFileSync(host, hostWas); }
      // (Vite's own notice that @solidjs/web's `import(entryUrl)` cannot be analysed is the dev server's, not the page's)
      h.check("the dev server: no console errors or warnings", h.problems.slice(from).length === 0, h.problems.slice(from));
    } finally { dev.kill(); writeFileSync(home, was[0]); writeFileSync(person, was[1]); }
  },
};
