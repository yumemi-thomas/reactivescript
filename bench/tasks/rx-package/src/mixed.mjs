// One page, two kinds of importer (09 MO-13g): an .rx program instantiates the package's module in its app, as its
// compiled code does (`__rt.module(__rx, __rx)`, MO-13c), and JavaScript uses the package's own exports. Run under the
// `browser` condition (the page) and without it (a request on the server); prints what each side saw, as JSON.
import { createApp } from "@reactivescript/runtime";
import { __rx, code, rate, pick } from "@bench/rates";
import { __rx as theme } from "@bench/rates/theme";
import { asked } from "./node_modules/@bench/rates/dist/rates.js";

const out = {};
if (process.execArgv.includes("--conditions=browser")) {
  // the browser. Before any program: JavaScript uses the package, and the runtime makes the page's app for it
  await pick("USD");
  const app = createApp({ root: null });                    // the .rx program starts: its app is the page's
  const mine = app.module(__rx, __rx);
  out.programSeesJs = mine.code();                           // "USD": the program reads what JavaScript wrote
  await mine.pick("GBP");
  out.jsSeesProgram = code();                                // "GBP": and JavaScript what the program wrote
  const second = createApp({ root: null });                  // a second program in the page: an app of its own
  out.second = second !== app && second.module(__rx, __rx).code();   // "EUR": its own instance
  out.jsStaysWithFirst = code();
} else {
  const { renderToString } = await import("@solidjs/web");
  const app = createApp({ request: new Request("http://localhost/") });
  const before = asked.length; let html = "";
  // the program's stream: its view instantiates the module (as its compiled imports do) and JavaScript reads the package
  await new Promise(end => app.stream(() => { const mine = app.module(__rx, __rx); app.module(theme, theme); let rate; try { rate = mine.rate(); } catch { rate = "pending"; } let js; try { js = code(); } catch (e) { js = e.message; } try { rate(); } catch { /* pending: the same question */ } return `${mine.code()}|${js}|${rate}`; }, { write: s => { html += s; }, end }));
  out.html = html; out.asked = asked.length - before;        // one instance: the rate was asked once
  out.plain = renderToString(() => code());
}
console.log(JSON.stringify(out));
