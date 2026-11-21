// A value computed differently on the server and in the browser (10 SV-7): the served page and the hydrated one disagree.
const hydrate = async h => {
  const base = await h.serve({ ssr: true }); const page = await h.open(base);
  await new Promise(r => setTimeout(r, 500));
  h.check("the hydrated page shows the browser's answer", /in the browser/.test(await h.text(page)), await h.text(page));
};
export default {
  title: "SSR: what only the browser knows is a client question, not a value computed on both sides",
  types: [
    { name: "the client question's answer keeps its type", edit: ["rendered in {place}", "rendered in {place.toFixed(1)}"], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "the client question read with nothing to hold it on the server", edit: ["loading fallback { <p class=\"place\">asking…</p> } { <p class=\"place\">rendered in {place}</p> }", "<p class=\"place\">rendered in {place}</p>"], expect: "CLIENT_QUESTION_UNHELD" },
    { name: "client JS called for its value while the view computes", edit: ["place = await whereAmI()", "place = whereAmI()"], expect: "CLIENT_NOT_AWAITED" },
    { name: "a `pure` JS call that answers differently on each side, read by the view (the declaration's assertion: reported when it runs)", edit: ['import { whereAmI } from "./env.js"', 'import { whereAmI, whereNow } from "./env.js"'], edit2: ["<h1>Hello</h1>", "<h1>Hello from {whereNow()}</h1>"], dev: /HYDRATION_MISMATCH|mismatch/i, drive: hydrate },
  ],
  async run(h) {
    const r = await h.ssr("/");
    h.check("the server sends the fallback: the question is not asked there", !r.error && /asking/.test(r.text) && !/the server/.test(r.text), r.error?.message ?? r.text);
    const base = await h.serve({ ssr: true }); const page = await h.open(base);
    h.check("hydrated, then answered in the browser", await h.until(async () => /rendered in the browser/.test(await h.text(page))), await h.text(page));
    h.check("no console errors or warnings (no mismatch)", h.problems.length === 0, h.problems);
  },
};
