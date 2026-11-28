// A value computed differently on the server and in the browser (10 SV-7): the served page and the hydrated one disagree.
export default {
  title: "SSR: what only the browser knows is a client question, not a value computed on both sides",
  types: [
    { name: "the client question's answer keeps its type", edit: ["rendered in {place}", "rendered in {place.toFixed(1)}"], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "the client question read with nothing to hold it on the server", edit: ["loading fallback { <p class=\"place\">asking…</p> } { <p class=\"place\">rendered in {place}</p> }", "<p class=\"place\">rendered in {place}</p>"], expect: "CLIENT_QUESTION_UNHELD" },
    { name: "client JS called for its value while the view computes", edit: ["place = await whereAmI()", "place = whereAmI()"], expect: "CLIENT_NOT_AWAITED" },
    // What a build cannot see and hydration does not say (Solid's development build adopts the server's text without
    // reading it): `pure` is the declaration's word, and rx-verify runs it — with no window and with a browser's
    // globals — and refuses a row whose answer is steady on each side and differs between them (10 SV-7c).
    { name: "what only the browser knows declared `pure`, and read by the view: the page would be served with one answer and hydrated with the other", file: "env.d.rx", edit: ["export client pure fn whereAmI(): Promise<string>\n", "export client pure fn whereAmI(): Promise<string>\nexport pure fn whereNow(): string\n"], file2: "main.rx", edit2: ['import { whereAmI } from "./env.js"\n\nexport default component App() {\n  place = await whereAmI()\n  <h1>Hello</h1>', 'import { whereAmI, whereNow } from "./env.js"\n\nexport default component App() {\n  place = await whereAmI()\n  <h1>Hello from {whereNow()}</h1>'], verify: ["env.d.rx", /MISMATCH\s+whereNow: declared pure, but it answers differently on the server and in the browser/] },
  ],
  async run(h) {
    const r = await h.ssr("/");
    h.check("the server sends the fallback: the question is not asked there", !r.error && /asking/.test(r.text) && !/the server/.test(r.text), r.error?.message ?? r.text);
    const base = await h.serve({ ssr: true }); const page = await h.open(base);
    h.check("hydrated, then answered in the browser", await h.until(async () => /rendered in the browser/.test(await h.text(page))), await h.text(page));
    h.check("no console errors or warnings (no mismatch)", h.problems.length === 0, h.problems);
    // the declaration, run: its one row is a client question, which is asked on one side only — nothing to refute
    const { spawnSync } = await import("node:child_process"); const path = (await import("node:path")).default;
    const v = spawnSync(process.execPath, ["--conditions=browser", path.join(h.dir, "../../node_modules/@reactivescript/language-server/bin/verify.js"), "env.d.rx"], { cwd: h.dir, encoding: "utf8" });
    h.check("rx-verify: the good declaration's rows are not contradicted, on either side", !/MISMATCH/.test(v.stdout), v.stdout + v.stderr);
  },
};
