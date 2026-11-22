// A library written in .rx, published as a package, used by two apps (09 MO-13): an .rx app, which is checked against
// the `.d.rx` the package ships and never sees its source, and a Solid 2 app in TypeScript, to which it is an ordinary
// Solid library. Solid: a component library ships JSX under the `solid` condition and the app compiles it; an .rx
// package ships compiled modules for the browser and the server, the signature the compiler printed, and its types.
//
// The package (`src/package`) is built by `rx-lib` (compiler/lib.mjs) when the task is staged and installed as
// `node_modules/@bench/rates`: its `dist/` only. No `.d.rx` of it is written by hand, and `rx-declare` drafts nothing.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { both, repo, rxc, ws } from "../../harness.mjs";

const SPECS = [["\"@bench/rates/theme\"", "\"./package/src/theme.rx\""], ["\"@bench/rates\"", "\"./package/src/index.rx\""]];
/** The app with the package imported by its source, module for module: what its verdicts are compared with. */
const bySource = text => SPECS.reduce((t, [a, b]) => t.replaceAll(a, b), text);

/** A served page without its scripts and hydration comments. */
const plain = html => html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--.*?-->/g, "");

const bad = [
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
    const shipped = ["theme", "index"].map(n => readFileSync(path.join(pkg, "dist", `${n}.d.rx`), "utf8"));
    h.check("the shipped .d.rx is the printed signature, marked, with no word written by hand (ref/ prints the same text)", shipped.every(s => /^\/\/@ signature /.test(s) && refText.includes(s.trim())), { shipped, refText });

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
    const probes = [["a prop", "<Badge label={label()} />", "<Badge label={3} />", /TS2322/], ["an action's parameter", "pick(\"USD\")", "pick(1)", /TS2345/], ["a source is an accessor", "{code()}=", "{code.toUpperCase()}=", /TS2339/], ["a `ref` parameter is an accessor", "useLabel(amount)", "useLabel(2)", /TS2345/], ["the error's field", "(err() as Offline).code", "(err() as Offline).cod", /TS2339|TS2551/]];
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
        try { server.render(new Request("http://localhost" + rq.url), { write: c => { out.write(c); if (first) { first = false; out.write(`</div><script type="module" src="/client.js"></script>`); } }, end: () => out.end("</body></html>") }); } catch (e) { h.problems.push("server: " + e.message); out.end(); }
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
      await page.click(".off");
      h.check(".tsx: the declared error is an instance of the class the package exports", await h.until(async () => (await h.text(page, ".err")) === "offline: ???"), await h.text(page));
    }
    {
      const base = await serve(true);
      const html = plain(await (await fetch(base)).text());
      h.check(".tsx, on the server: the package's server build renders and streams the rate, with hydration keys", /_hk=/.test(html) && /class="badge"[^>]*>2 EUR</.test(html) && /EUR at 1</.test(html), html.slice(0, 900));
      const again = plain(await (await fetch(base)).text());
      h.check(".tsx, on the server: a second request renders the same page (the package's state is each request's)", again === html, again.slice(0, 900));
      const page = await h.open(base);
      h.check(".tsx, hydrated: the browser takes the server's page over", await h.until(async () => (await h.text(page, "header")) === "2 EUR" && (await h.text(page, ".raw")) === "EUR=1"), await h.text(page));
      await page.click(".more"); await page.click(".usd");
      h.check(".tsx, hydrated: the page is live", await h.until(async () => (await h.text(page, "header")) === "3 USD" && (await h.text(page, ".rate")) === "USD at 1.25"), await h.text(page));
    }
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
