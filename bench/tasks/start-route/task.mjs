// A TanStack Start route with .rx components, served and hydrated under a URL that is not the default one: a path
// param and a search param (11 CP-4d, 10 SV-3/SV-4).
import { execFileSync, spawn } from "node:child_process";
import path from "node:path";
import { ws } from "../../harness.mjs";

export default {
  title: "TanStack Start: an .rx page served and hydrated at /people/2?tab=role",
  entry: "src/pages.rx",
  host: true,   // the TSX routes import it with ?rx-lib: its exported components are applied by JS
  // the build first: Start's plugin writes the route tree the routes are typed by
  prepare(dir) { execFileSync(process.execPath, [path.join(ws, "node_modules/vite/bin/vite.js"), "build"], { cwd: dir, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, RX_TYPECHECK: "0" } }); },
  types: [
    { name: "a route passing the .rx page a number is refused on its line (pages.rx types the import)", file: "src/routes/people.$id.tsx", edit: ["<PersonCard id={params().id}", "<PersonCard id={Number(params().id)}"], expect: /people\.\$id\.tsx\(\d+,\d+\): error TS2322/ },
    { name: "the page's `tab` is the route's validated search", file: "src/routes/people.$id.tsx", edit: ['tab={search().tab ?? "name"}', 'tab="bio"'], expect: /TS2322/ },
    { name: "the answer keeps the backend's type in the .rx page", edit: ["{person.role}</p>", "{person.rank}</p>"], expect: /TS2339/ },
  ],
  bad: [
    { name: "the page's data read with no errored boundary around it", edit: ["errored fallback(e: NotFound) { <p class=\"missing\">{e.message}</p> } {\n    loading fallback { <p>loading…</p> } {\n      <h2>{person.name}</h2>\n      if (props.tab == \"role\") { <p class=\"role\">{person.role}</p> } else { <p class=\"plain\">no details</p> }\n    }\n  }", "loading fallback { <p>loading…</p> } {\n    <h2>{person.name}</h2>\n  }"], expect: "UNHANDLED_FAILURE" },
    { name: "module state written while a page renders (it would differ per request)", edit: ["<h2>{person.name}</h2>", "<h2>{clicks := 1}</h2>"], expect: "PARSE" },
    { name: "the page's param copied into state once: the next URL would show the old person", edit: ["person = await fetchPerson(props.id)", "source id := props.id\n  person = await fetchPerson(id)"], expect: "SNAPSHOT_INITIALIZER" },
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
      const page = await h.page();
      await page.goto(base + "/people/2?tab=role");
      const text = async () => ((await page.textContent("#app")) ?? "").replace(/\s+/g, " ").trim();
      h.check("hydrated under that URL", await h.until(async () => /Bo\s*designer/.test(await text())), await text());
      await page.evaluate(() => { window.__same = true; });
      await page.click("button.counter"); await page.click("button.counter");
      h.check("the hydrated page is live: an .rx source written by a click", await h.until(async () => (await text()).includes("clicks: 2")), await text());
      await page.click("nav >> text=Ann");
      h.check("client navigation to another URL: the page follows its params, the search gone", await h.until(async () => /Ann\s*no details/.test(await text())), await text());
      await page.click("nav >> text=Nobody");
      h.check("the page's typed NotFound boundary", await h.until(async () => (await text()).includes("no person 9")), await text());
      h.check(".rx module state kept across routes, in the same document", (await text()).includes("clicks: 2") && await page.evaluate(() => window.__same === true), await text());
      h.check("no console errors or warnings (no hydration mismatch)", h.problems.length === 0, h.problems);
    } finally { server.kill(); }
  },
};
