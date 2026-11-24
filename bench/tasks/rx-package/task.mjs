// A library written in .rx, published as a package, used by two apps (09 MO-13): an .rx app, which is checked against
// the `.d.rx` the package ships and never sees its source, and a Solid 2 app in TypeScript, to which it is an ordinary
// Solid library. Solid: a component library ships JSX under the `solid` condition and the app compiles it; an .rx
// package ships compiled modules for the browser and the server, the signature the compiler printed, and its types.
//
// The package (`src/package`) is built by `rx-lib` (compiler/lib.mjs) when the task is staged and installed as
// `node_modules/@bench/rates`: its `dist/` only. No `.d.rx` of it is written by hand, and `rx-declare` drafts nothing.
//
// The package's state is one per page, whoever imports it (MO-13g): `src/mixed.mjs` is an .rx program's app and
// JavaScript over one instance, and `web/server.tsx` renders the .tsx app with a plain renderToStream, two at once.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { both, repo, rxc, ws } from "../../harness.mjs";

const SPECS = [["\"@bench/rates/theme\"", "\"./package/src/theme.rx\""], ["\"@bench/rates/pager\"", "\"./package/src/pager.rx\""], ["\"@bench/rates\"", "\"./package/src/index.rx\""]];
/** The app with the package imported by its source, module for module: what its verdicts are compared with. */
const bySource = text => SPECS.reduce((t, [a, b]) => t.replaceAll(a, b), text);

/** A served page without its scripts and hydration comments. */
const plain = html => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--.*?-->/g, "");

const bad = [
  { name: "an action among the parts a package's fn answers, called while the view computes", edit: ["page {pager.page}:", "page {pager.set(2)}:"], expect: "ACTION_CALLED_IN_OWNED_SCOPE" },
  { name: "a part of what a package's fn answers, read where the record's wait is not held", edit: ["  <footer><Own /></footer>", "  <footer><Own /> {pager.page}</footer>"], expect: "UNHANDLED_FAILURE" },
  { name: "the package's component outside the package's provider", edit: ["  <footer><Own /></footer>", "  <footer><Own /> <Badge label=\"late\" /></footer>"], expect: "CONTEXT_NOT_FOUND" },
  { name: "the package's context provided beside its reader, not above it", edit: ["  provide theme = { accent: \"navy\" }\n  <Badge label=\"own\" />", "  <Badge label=\"own\" />"], expect: "CONTEXT_NOT_FOUND" },
  { name: "the rate read where only its declared error is taken: the request's own failure gets out", edit: ["{errored fallback(e) { <p class=\"err\">failed: {e.message}</p> } {\n", "{if true {\n"], expect: "UNHANDLED_FAILURE" },
  { name: "the package's component that can fail, under no boundary", edit: ["  <footer><Own /></footer>", "  <footer><Own /> <Rate /></footer>"], expect: "UNHANDLED_FAILURE" },
  { name: "the package's source written by the app, not through its action", edit: ["onClick={() => { pick(\"USD\") }}", "onClick={() => { code := \"USD\" }}"], expect: "WRITE_TO_NON_SOURCE" },
  { name: "a plain source of the package asked again as if it were a question", edit: ["onClick={() => { refresh rate }}", "onClick={() => { refresh code }}"], expect: "INVALID_REFRESH_TARGET" },
  { name: "the package's action called while the view computes", edit: ["<i class=\"raw\">{code}={rate}</i>", "<i class=\"raw\">{pick(\"USD\")}={rate}</i>"], expect: "ACTION_CALLED_IN_OWNED_SCOPE" },
  { name: "the package's primitive called in a handler, where nothing owns what it makes", edit: ["onClick={() => { amount := a => a + 1 }}", "onClick={() => { useLabel(amount); amount := a => a + 1 }}"], expect: "INSTANTIATION_NOT_BOUND" },
  { name: "the package's rows restated at the import", edit: ["import { code, rate, pick, useLabel, Badge, Rate, Offline } from \"@bench/rates\"", "import { code, rate, pick, useLabel, Badge, Rate, Offline } from \"@bench/rates\" fails Offline"], expect: "IMPORT_ROW_MISMATCH" },
];

export default {
  title: "A package written in .rx: used by an .rx app through its shipped .d.rx, and by a .tsx Solid 2 app as a Solid library",
  async prepare(dir) {
    // the package, built as its author builds it (`rx-lib`), and installed: its package.json and dist/, nothing else
    const { build } = await import(pathToFileURL(path.join(repo, "compiler/lib.mjs")).href);
    process.env.RXC = rxc; process.env.RX_TSC = path.join(repo, "tooling/rx-language-server/bin/tsc.js");
    const pkg = path.join(dir, "package");
    const built = build(pkg, {});
    writeFileSync(path.join(dir, "build.json"), JSON.stringify({ ok: built.ok, problems: built.problems, files: built.files.map(f => path.relative(pkg, f)).sort(), exports: built.exports }, null, 2));
    const at = path.join(dir, "node_modules/@bench/rates"); rmSync(at, { recursive: true, force: true }); mkdirSync(at, { recursive: true });
    cpSync(path.join(pkg, "package.json"), path.join(at, "package.json"));
    if (existsSync(path.join(pkg, "dist"))) cpSync(path.join(pkg, "dist"), path.join(at, "dist"), { recursive: true });
    rmSync(path.join(pkg, "dist"), { recursive: true, force: true });
    for (const e of readdirSync(pkg)) if (e.startsWith(".rx-lib-")) rmSync(path.join(pkg, e), { recursive: true, force: true });
  },
  types: [
    { name: "a prop of the package's component keeps its type", edit: ["<header><Badge label={label} /></header>", "<header><Badge label={3} /></header>"], expect: /TS2322/ },
    { name: "the package's action keeps its parameter's type", edit: ["pick(\"USD\")", "pick(1)"], expect: /TS2345/ },
    { name: "the package's primitive keeps the type of its reference", edit: ["useLabel(amount)", "useLabel(\"two\")"], expect: /TS2345/ },
    { name: "the declared error keeps its fields", edit: ["offline: {e.code}", "offline: {e.cod}"], expect: /TS2339|TS2551/ },
    { name: "a provision is checked against the package's context type", edit: ["accent: \"navy\"", "accent: 3"], expect: /TS2322|TS2345/ },
    { name: "the package's source keeps its type", edit: ["{code}={rate}", "{code.nope}={rate}"], expect: /TS2339/ },
  ],
  bad,
  async run(h) {
    const dir = h.dir; const pkg = path.join(dir, "node_modules/@bench/rates");
    // ---- what was shipped ----
    const built = JSON.parse(readFileSync(path.join(dir, "build.json"), "utf8"));
    h.check("rx-lib built the package, and its package.json's exports name what was built", built.ok, built.problems);
    const must = ["index.js", "index.server.js", "index.dom.js", "index.ssr.js", "index.d.rx", "index.d.ts", "index.rx.d.ts", "theme.js", "theme.server.js", "theme.d.rx", "theme.d.ts", "theme.rx.d.ts", "rx-prelude.d.ts", "rates.js"];
    h.check("the package holds a browser and a server build, its signature and its types for each module", must.every(f => existsSync(path.join(pkg, "dist", f))), must.filter(f => !existsSync(path.join(pkg, "dist", f))));
    // no word of the package's .d.rx is a person's: each is the signature both checkers print from the module's source
    const printed = file => { const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", path.join(repo, "ref/check.ts"), "--signature", file], { encoding: "utf8" }); return r.stdout; };
    const refText = printed(path.join(dir, "package/src/index.rx"));
    const pagerText = printed(path.join(dir, "package/src/pager.rx"));
    const shipped = ["theme", "index", "pager"].map(n => readFileSync(path.join(pkg, "dist", `${n}.d.rx`), "utf8"));
    h.check("the shipped .d.rx is the printed signature, marked, with no word written by hand (ref/ prints the same text)", shipped.every(s => /^\/\/@ signature /.test(s) && (refText + pagerText).includes(s.trim())), { shipped, refText, pagerText });
    h.check("the printed signature says each part of what a fn answers: what is read with its rows, the action, the value made once", /^export pure fn createPager\(ref pages: number, first: number\): pending fails\(Error\) \{ page: ref; quote: ref pending fails\(Error\); set: io; first: value; edges: \{ start: ref; end: ref \}; label: value \} instantiates$/m.test(shipped[2]) && /^export pure fn createPages\(ref pages: number\): pending fails\(Error\) \[ref, io\] instantiates$/m.test(shipped[2]), shipped[2]);

    // ---- the .rx app: against the shipped .d.rx as against the package's source (MO-9b across the boundary) ----
    const good = readFileSync(path.join(dir, "main.rx"), "utf8");
    const verdicts = (text) => {
      writeFileSync(path.join(dir, "probe.rx"), text); writeFileSync(path.join(dir, "probe-source.rx"), bySource(text));
      const key = r => JSON.stringify([r.crate.diagnostics, r.ref.diagnostics].map(ds => ds.map(d => `${d.code}@${d.line}`)));
      const a = both(path.join(dir, "probe.rx")), b = both(path.join(dir, "probe-source.rx"));
      return { same: key(a) === key(b) && a.agree && b.agree, shipped: key(a), source: key(b) };
    };
    const g = verdicts(good);
    h.check("the good app: the same verdict against the shipped .d.rx as against the package's source", g.same && g.shipped === "[[],[]]", g);
    const differ = [];
    for (const b of bad) {
      let text = good.replace(b.edit[0], b.edit[1]); if (b.edit2) text = text.replace(b.edit2[0], b.edit2[1]);
      const v = verdicts(text); if (!v.same || v.shipped === "[[],[]]") differ.push({ name: b.name, ...v });
    }
    h.check(`each of the ${bad.length} mistakes: the same diagnostics, on the same lines, against the shipped .d.rx as against the source`, differ.length === 0, differ);
    rmSync(path.join(dir, "probe.rx")); rmSync(path.join(dir, "probe-source.rx"));

    {
      const base = await h.serve({ ssr: true }); const page = await h.open(base);
      const html = plain(await (await fetch(base)).text());
      h.check("the .rx app, served: the package's badge, and its rate once the server has it, are in the server's stream", /class="badge"[^>]*>2 EUR</.test(html) && /asking…|asking&#8230;/.test(html) && /EUR at 1</.test(html), html.slice(0, 900));
      h.check("the .rx app, hydrated: the package's state is the app's", await h.until(async () => /2 EUR/.test(await h.text(page, "header")) && (await h.text(page, ".raw")) === "EUR=1"), await h.text(page));
      await page.click(".more"); await page.click(".usd");
      h.check("the package's action writes its source; the primitive's label and the rate follow", await h.until(async () => (await h.text(page, "header")) === "3 USD" && (await h.text(page, ".raw")) === "USD=1.25" && (await h.text(page, ".rate")) === "USD at 1.25"), await h.text(page));
      await page.click(".off");
      h.check("the package's declared error reaches the app's typed boundary, with its field", await h.until(async () => (await h.text(page, ".offline")) === "offline: ???"), await h.text(page));
      await page.click(".none");
      h.check("the request's own failure reaches the outer boundary", await h.until(async () => /failed: no table for XXX/.test(await h.text(page))), await h.text(page));
      h.check("the app's own provision of the package's context reaches the package's component", /own/.test(await h.text(page, "footer")) && await page.$eval("footer .badge", el => el.style.color) === "navy", await h.text(page, "footer"));
    }

    // ---- the .tsx app: TypeScript's check against the shipped .d.ts, then the browser and the server ----
    const web = path.join(dir, "web");
    const tsc = (extra = []) => { const r = spawnSync(process.execPath, [path.join(ws, "node_modules/typescript/bin/tsc"), "-p", path.join(web, "tsconfig.json"), ...extra], { encoding: "utf8" }); return r.status === 0 ? "" : r.stdout + r.stderr || `exit ${r.status}`; };
    const clean = tsc();
    h.check("the .tsx app type-checks with tsc against the package's .d.ts (no skipLibCheck)", clean === "", clean);
    const app = readFileSync(path.join(web, "app.tsx"), "utf8");
    const probes = [["a prop", "<Badge label={label()} />", "<Badge label={3} />", /TS2322/], ["an action's parameter", "pick(\"USD\")", "pick(1)", /TS2345/], ["a source is an accessor", "{code()}=", "{code.toUpperCase()}=", /TS2339/], ["a `ref` parameter is an accessor or the value", "useLabel(amount)", "useLabel(\"two\")", /TS2345/], ["a part that is read is an accessor", "{page()}</b>", "{page.toFixed()}</b>", /TS2339/], ["an action's parameter, among the parts", "set(3)", "set(\"3\")", /TS2345/], ["an action answers a promise", "set(9)", "set(9).toFixed()", /TS2339/], ["a nested part", "edges.end()", "edges.last()", /TS2339/], ["a value made once is no accessor", "{first}", "{first()}", /TS2349/], ["a tuple's part", "at()}", "at().at()}", /TS2339/], ["the error's field", "(err() as Offline).code", "(err() as Offline).cod", /TS2339|TS2551/]];
    const lost = [];
    for (const [name, from, to, expect] of probes) { writeFileSync(path.join(web, "app.tsx"), app.replace(from, to)); const out = tsc(); if (!expect.test(out)) lost.push(`${name}: ${out || "accepted"}`); }
    writeFileSync(path.join(web, "app.tsx"), app);
    h.check(`the .tsx app: ${probes.length} type mistakes at the package's boundary are TypeScript errors`, lost.length === 0, lost);

    const req = createRequire(path.join(ws, "package.json"));
    const { transform } = req("@solidjs/compiler"); const esbuild = req("esbuild");
    // Solid's own compiler for the app's JSX, as its Vite plugin runs it; the package is not compiled again
    const solid = generate => ({ name: "solid", setup(b) { b.onLoad({ filter: /\.tsx$/ }, a => { const r = transform(readFileSync(a.path, "utf8"), { filename: a.path, generate, hydratable: true, moduleName: "@solidjs/web" }); return { contents: r.code, loader: "ts" }; }); } });
    const client = (await esbuild.build({ entryPoints: [path.join(web, "client.tsx")], bundle: true, write: false, format: "esm", platform: "browser", conditions: ["browser", "development"], logLevel: "silent", absWorkingDir: dir, plugins: [solid("dom")] })).outputFiles[0].text;
    h.check("the browser bundle holds the package's browser build, not its server build", /index\.dom\.js/.test(client) && !/index\.ssr\.js/.test(client), "which build was bundled");
    await esbuild.build({ entryPoints: [path.join(web, "server.tsx")], bundle: true, outfile: path.join(web, "server.mjs"), format: "esm", platform: "node", packages: "external", logLevel: "silent", absWorkingDir: dir, plugins: [solid("ssr")] });
    const server = await import(pathToFileURL(path.join(web, "server.mjs")).href);
    const serve = ssr => new Promise(res => {
      const s = createServer((rq, out) => {
        if (rq.url === "/client.js") { out.writeHead(200, { "content-type": "text/javascript" }); return out.end(client); }
        if (rq.url === "/favicon.ico") { out.writeHead(404); return out.end(); }
        out.writeHead(200, { "content-type": "text/html" });
        if (!ssr) return out.end(`<!doctype html><html><head><meta charset="utf-8"></head><body><div id="app"></div><script type="module" src="/client.js"></script></body></html>`);
        out.write(`<!doctype html><html><head>${server.generateHydrationScript()}</head><body><div id="app">`);
        let first = true;
        try { server[ssr](new Request("http://localhost" + rq.url), { write: c => { out.write(c); if (first) { first = false; out.write(`</div><script type="module" src="/client.js"></script>`); } }, end: () => out.end("</body></html>") }); } catch (e) { h.problems.push("server: " + e.message); out.end(); }
      });
      s.listen(0, "127.0.0.1", () => { h.servers.push(s); res(`http://127.0.0.1:${s.address().port}`); });
    });
    {
      const page = await h.open(await serve(false));
      h.check(".tsx, in the browser: the package's provider, badge and rate render", await h.until(async () => (await h.text(page, "header")) === "2 EUR" && (await h.text(page, ".rate")) === "EUR at 1" && (await h.text(page, ".raw")) === "EUR=1"), await h.text(page));
      await page.click(".more"); await page.click(".usd");
      h.check(".tsx: the action, the accessor and the primitive over an accessor follow", await h.until(async () => (await h.text(page, "header")) === "3 USD" && (await h.text(page, ".raw")) === "USD=1.25"), await h.text(page));
      await page.click(".hide"); await page.click(".hide"); await page.click(".more");
      h.check(".tsx: the package's state outlives the component that first read it", await h.until(async () => (await h.text(page, ".rate")) === "USD at 1.25" && (await h.text(page, "header")) === "4 USD"), await h.text(page));
      const part = async c => h.text(page, `.pager ${c}`), titles = () => page.evaluate(() => window.__followed.join(" "));
      h.check(".tsx: a fn's parts, each an accessor: the one that waits holds its own place and no other", await h.until(async () => (await part(".page")) === "1" && (await part(".edge")) === "start" && (await part(".label")) === `1 of 12` && (await part(".first")) === "1" && (await part(".quote")) === "10" && (await part(".go")) === "1"), await part(""));
      const seen = await page.evaluate(() => [window.__pages.join(), window.__followed.join(" ")]);
      await page.click(".set3");
      h.check(".tsx: the action writes; a reader, an effect over an accessor, and the fn's own effect follow", await h.until(async () => (await part(".page")) === "3" && (await part(".edge")) === "middle" && (await part(".quote")) === "30" && (await page.evaluate(() => window.__pages.join())).endsWith("1,3") && /-1 \+3/.test(await titles())), [seen, await titles(), await part("")]);
      await page.click(".set9");
      h.check(".tsx: a part that fails reaches the boundary around its reader, and the others are read on", await h.until(async () => (await part(".quote")) === "no quote for page 9" && (await part(".page")) === "9"), await part(""));
      await page.click(".go");
      h.check(".tsx: the parts a fn hands on from another's, over a plain value given for a `ref` parameter", await h.until(async () => (await part(".go")) === "4"), await part(".go"));
      await page.click(".hide");
      h.check(".tsx: disposed with the component that called it: the fn's effects are cleaned up", await h.until(async () => /-9/.test(await titles()) && /-4/.test(await titles())), await titles());
      await page.click(".off");
      h.check(".tsx: the declared error is an instance of the class the package exports", await h.until(async () => (await h.text(page, ".err")) === "offline: ???"), await h.text(page));
    }
    // the server's render is a plain renderToStream, as any Solid app's (MO-13g: the package's state is the render's), and
    // the same inside Solid's request event (a framework's: the request's)
    for (const [how, entry] of [["a plain renderToStream", "render"], ["inside a request event", "renderInRequest"]]) {
      const base = await serve(entry);
      const html = plain(await (await fetch(base)).text());
      h.check(`.tsx, on the server, ${how}: the package's server build renders and streams the rate, with hydration keys`, /_hk=/.test(html) && /class="badge"[^>]*>2 EUR</.test(html) && /EUR at 1</.test(html), html.slice(0, 900));
      const again = plain(await (await fetch(base)).text());
      h.check(`.tsx, on the server, ${how}: a fn's parts render, the one that waits streamed`, /class="page"[^>]*>1</.test(html) && /class="edge"[^>]*>start</.test(html) && /class="quote"[^>]*>10</.test(html), html.slice(0, 1500));
      h.check(`.tsx, on the server, ${how}: a second request renders the same page (the package's state is each one's)`, again === html, again.slice(0, 900));
      const page = await h.open(base);
      // the module's nodes have the server's ids (MO-13h): with other ids the rate would be pending again here, and Solid
      // reports the fallback it cannot find in the server's page (a console error: the last check)
      h.check(`.tsx, hydrated (${how}): the browser takes the server's page over`, await h.until(async () => (await h.text(page, "header")) === "2 EUR" && (await h.text(page, ".raw")) === "EUR=1"), await h.text(page));
      await page.click(".more"); await page.click(".usd");
      h.check(`.tsx, hydrated (${how}): the page is live`, await h.until(async () => (await h.text(page, "header")) === "3 USD" && (await h.text(page, ".rate")) === "USD at 1.25"), await h.text(page));
      await page.click(".set3"); await page.click(".go");
      h.check(`.tsx, hydrated (${how}): the fn's parts are live`, await h.until(async () => (await h.text(page, ".pager .page")) === "3" && (await h.text(page, ".pager .quote")) === "30" && (await h.text(page, ".pager .go")) === "4"), await h.text(page, ".pager"));
    }
    {
      // two renders at once, each a plain renderToStream: each has its own instance of the package's module, before its
      // rate is known and after (the instances are numbered as they are made)
      const collect = entry => new Promise(res => { let out = ""; server[entry]({ write: c => { out += c; }, end: () => res(plain(out)) }); });
      const seen = html => { const a = /<p[^>]*>(\d+):EUR/.exec(html), b = /<b[^>]*>1@(\d+)<\/b>/.exec(html); return a && b ? [a[1], b[1]] : null; };
      for (const [how, entry] of [["plain renders", "probe"], ["requests", "probeInRequest"]]) {
        const [x, y] = (await Promise.all([collect(entry), collect(entry)])).map(seen);
        h.check(`two ${how} at once: each reads its own instance of the package's state, before the rate lands and after, and never the other's`, !!x && !!y && x[0] === x[1] && y[0] === y[1] && x[0] !== y[0], { x, y });
      }
      const one = /(\d+):EUR:(\d+)/.exec(plain(server.probeString())), two = /(\d+):EUR:(\d+)/.exec(plain(server.probeString()));
      h.check("a plain renderToString: one instance for the render, another for the next", !!one && !!two && one[1] === one[2] && two[1] === two[2] && one[1] !== two[1], { one, two });
      h.check("a fn of a module that holds no state, called on the server where nothing renders: it works, and two calls share nothing", server.outsideStateless() === "2,false,1 of 5;3", server.outsideStateless());
      const outside = server.outside();
      h.check("an export read on the server where nothing renders and no request is answered throws, and says what to do", /^threw: /.test(outside) && /outside a render and outside a request/.test(outside) && /renderToString/.test(outside) && /provideRequestEvent/.test(outside), outside);
    }
    {
      // one page, an .rx program and JavaScript both importing the package: one instance of its state (MO-13g)
      const mixed = cond => { const r = spawnSync(process.execPath, [...cond, path.join(dir, "mixed.mjs")], { cwd: dir, encoding: "utf8" }); try { return JSON.parse(r.stdout.trim().split("\n").pop()); } catch { return { error: r.stdout + r.stderr }; } };
      const b = mixed(["--conditions=browser"]);
      h.check("in the browser, an .rx program and JavaScript that import the package share one instance: each reads what the other wrote, whichever came first", b.programSeesJs === "USD" && b.jsSeesProgram === "GBP", b);
      h.check("a second .rx program in the page is a second app, with an instance of its own; JavaScript stays with the page's first", b.second === "EUR" && b.jsStaysWithFirst === "GBP", b);
      const s = mixed([]);
      h.check("on the server, inside an .rx program's stream, JavaScript reads the program's instance: the rate is asked once", /EUR\|EUR\|/.test(s.html ?? "") && s.asked === 1 && s.plain === "EUR", s);
    }
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
