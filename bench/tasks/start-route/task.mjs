// A TanStack Start app whose layout and pages are .rx components, served and hydrated under a URL that is not the
// default one: a path param and a search param (11 CP-4d, 10 SV-3/SV-4). The route tree is the generator's
// (routeTree.gen.ts, written by Start's plugin around the TSX route files), so links and hooks in the .rx pages are typed
// by it; what the router does with the components is stated once, in host.d.rx (09 MO-14), so a page is checked among
// its layout's children, under the router. (TanStack's generator takes .ts, .tsx, .js, .jsx and .vue files and reads a
// route file as JavaScript: an .rx file is not picked up, so each route file is TSX that imports its component.)
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";

const REGIONS = "errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <main>{props.children}</main> }\n  }";
const VIEW = "[{ component: Layout, children: [{ component: Home }, { component: Person }] }]";
export default {
  title: "TanStack Start: file routes around an .rx layout and .rx pages, served and hydrated at /people/2?tab=role",
  entry: "src/pages.rx",
  host: true,   // the TSX routes import it with ?rx-lib: its exported components are applied by JS, where src/host.d.rx says
  // the build first: Start's plugin writes the route tree the routes are typed by
  prepare(dir) { execFileSync(process.execPath, [path.join(dir, "node_modules/vite/bin/vite.js"), "build"], { cwd: dir, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, RX_TYPECHECK: "0" } }); },
  types: [
    { name: "a link to no route is refused (the generated route tree)", edit: ['<Link to="/">Home</Link>', '<Link to="/home">Home</Link>'], expect: /TS2322|TS2820/ },
    { name: "useParams' `from` is a route of the tree", edit: ['useParams({ from: "/people/$id" })', 'useParams({ from: "/person/$id" })'], expect: /TS2322|TS2820|TS2345/ },
    { name: "a route giving the .rx page a tab it has not is refused on its line (pages.rx types the import)", file: "src/routes/people.$id.tsx", edit: ['tab={Route.useSearch()().tab ?? "name"}', 'tab="bio"'], expect: /people\.\$id\.tsx\(\d+,\d+\): error TS2322/ },
    { name: "the answer keeps the backend's type in the .rx page", edit: ["{person.role}</p>", "{person.rank}</p>"], expect: /TS2339/ },
  ],
  bad: [
    { name: "a page that can fail, with no errored region in the layout around its pages", edit: [REGIONS, "loading fallback { <p>loading…</p> } { <main>{props.children}</main> }"], expect: "UNHANDLED_FAILURE" },
    { name: "the layout's pages rendered beside its regions, not in them", edit: [REGIONS, "errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    loading fallback { <p>loading…</p> } { <p>ready</p> }\n  }\n  <main>{props.children}</main>"], expect: "UNHANDLED_FAILURE" },
    { name: "a router hook in a component the host's declaration does not place (JS may render it outside the router)", edit: ["export component Counter(props: { label: string }) {\n", "export component Counter(props: { label: string }) {\n  where = useParams({ strict: false })\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "the host's declaration says a page is rendered beside the layout, not among its children", file: "src/host.d.rx", edit: [VIEW, "[{ component: Layout, children: [{ component: Home }] }, { component: Person }]"], expect: "UNHANDLED_FAILURE" },
    { name: "the host's declaration provides no router", file: "src/host.d.rx", edit: [" provides(router)", ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "module state written while a page renders (it would differ per request)", edit: ["<h2>{person.name}</h2>", "<h2>{clicks := 1}</h2>"], expect: "PARSE" },
    { name: "the page's param copied into state once: the next URL would show the old person", edit: ["person = await fetchPerson(params.id)", "source id := params.id\n  person = await fetchPerson(id)"], expect: "SNAPSHOT_INITIALIZER" },
  ],
  async run(h) {
    const server = spawn(process.execPath, ["serve.mjs"], { cwd: h.dir, env: { ...process.env, PORT: "0" } });
    try {
      const port = await new Promise((resolve, reject) => { server.stdout.on("data", d => { const m = /listening (\d+)/.exec(String(d)); if (m) resolve(Number(m[1])); }); server.on("exit", c => reject(new Error(`server exited ${c}`))); });
      const base = `http://127.0.0.1:${port}`;
      const bodyText = html => (/<body>([\s\S]*)<\/body>/.exec(html.replace(/<script[\s\S]*?<\/script>/g, ""))?.[1] ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const served = bodyText(await (await fetch(base + "/people/2?tab=role")).text());
      h.check("/people/2?tab=role is rendered on the server for that URL: the person and the tab", /Bo/.test(served) && /designer/.test(served), served);
      const plain = bodyText(await (await fetch(base + "/people/1")).text());
      h.check("/people/1 (no search): the other branch", /Ann/.test(plain) && /no details/.test(plain) && !/engineer/.test(plain), plain);
      const missing = bodyText(await (await fetch(base + "/people/9")).text());
      h.check("/people/9: the page's NotFound is shown by the layout's region, on the server", /no person 9/.test(missing), missing);
      const page = await h.page();
      await page.goto(base + "/people/2?tab=role");
      const text = async () => ((await page.textContent("#app")) ?? "").replace(/\s+/g, " ").trim();
      h.check("hydrated under that URL", await h.until(async () => /Bo\s*designer/.test(await text())), await text());
      await page.evaluate(() => { window.__same = true; });
      await page.click("button.counter"); await page.click("button.counter");
      h.check("the hydrated page is live: an .rx source written by a click", await h.until(async () => (await text()).includes("clicks: 2")), await text());
      await page.click("nav >> text=Ann");
      h.check("client navigation to another URL: the page follows the router's params, the search gone", await h.until(async () => /Ann\s*no details/.test(await text())), await text());
      await page.click("nav >> text=Nobody");
      h.check("the page's NotFound at the layout's typed region", await h.until(async () => (await text()).includes("no person 9")), await text());
      h.check(".rx module state kept across routes, in the same document", (await text()).includes("clicks: 2") && await page.evaluate(() => window.__same === true), await text());
      h.check("no console errors or warnings (no hydration mismatch)", h.problems.length === 0, h.problems);
    } finally { server.kill(); }
  },
};
