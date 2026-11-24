// solid-use's primitives (lxsmnsyc; 09 MO-10a, MO-10b, MO-10d, 10 SV): accessors a hook hands back, read as values; a
// signal that is false on the server and through hydration; a value the server makes and the browser takes from it.
// Solid: `const wide = useMediaQuery("(min-width: 600px)")`, `<ClientOnly fallback={<p>…</p>}>`, `useServerValue(() => …)`.
// The fallback is an element in a prop: a component of the app's given by name (09 MO-11t).
// Half of the package's modules export their utility as the default (`solid-use/online-status`): the program imports
// each as JavaScript does, `import { default as useOnlineStatus }`, and its row is named `default` (09 MO-8u). src/use.js
// named them until 2026-11-25, and keeps the one call an `.rx` program cannot write.
const ticketOf = text => /ticket (\w+)/.exec(text)?.[1];
export default {
  title: "solid-use: media, network and visibility primitives, a client-only part, a value made on the server",
  types: [
    { name: "a primitive's value keeps its type: a boolean, not a string", edit: ['layout = compact || !wide ? "narrow" : "wide"', 'layout = compact || !wide.startsWith("w") ? "narrow" : "wide"'], expect: /TS2339|TS2551/ },
    { name: "a primitive's parameter is the library's", edit: ['useMediaQuery("(min-width: 600px)")', "useMediaQuery(600)"], expect: /TS2345|TS2769/ },
    { name: "a component's props are the library's", edit: ["<ClientOnly fallback={Measuring}>", '<ClientOnly fallbak="measuring…">'], expect: /TS2322|TS2769|TS2353/ },
    { name: "the server's value keeps its type", edit: ["ticket {ticket}", "ticket {ticket.toFixed(1)}"], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "a primitive made where the view reads it, again on every change", edit: ['{online ? "online" : "offline"}', '{useOnlineStatus() ? "online" : "offline"}'], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "a primitive made in a click handler, not where the component is made", edit: ["onClick={() => { compact := c => !c }}", "onClick={() => { usePrefersDark() }}"], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "the query computed from state: the primitive reads it once", edit: ['useMediaQuery("(min-width: 600px)")', 'useMediaQuery(compact ? "(min-width: 900px)" : "(min-width: 600px)")'], expect: "SNAPSHOT_ARGUMENT" },
    { name: "a primitive's value written", edit: ["onClick={() => { compact := c => !c }}", "onClick={() => { wide := false }}"], expect: "WRITE_TO_NON_SOURCE" },
    { name: "the layout kept in a source by an effect, not derived", edit: ['  layout = compact || !wide ? "narrow" : "wide"', '  source layout: string := "narrow"\n  effect (wide) { layout := $0 && !compact ? "wide" : "narrow" }'], advise: "EFFECT_RELAY_TEAR" },
    { name: "the server's value asked for where the view reads it", edit: ["ticket {ticket}", "ticket {useTicket()}"], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "the fallback's component called as a function, not given", edit: ["<ClientOnly fallback={Measuring}>", "<ClientOnly fallback={Measuring()}>"], expect: "COMPONENT_AS_VALUE" },
    { name: "the accessor called, as in Solid", edit: ['{online ? "online" : "offline"}', '{online() ? "online" : "offline"}'], ts: /TS2349|TS6234/ },
  ],
  async run(h) {
    const r = await h.ssr("/");
    h.check("server: no window, no system, no network — the primitives' server values", !r.error && /narrow, light/.test(r.text) && /online, in view/.test(r.text), r.error?.message ?? r.text);
    h.check("server: the client signal is false, the client-only part is its fallback", /from the server/.test(r.text) && /measuring/.test(r.text) && !/column/.test(r.text), r.text);
    const base = await h.serve({ ssr: true });
    const page = await h.page(); await page.setViewportSize({ width: 800, height: 600 });
    const res = await page.goto(base + "/"); const sent = ticketOf((await res.text()).replace(/<!--.*?-->/g, ""));
    await page.waitForFunction(() => window.__mounted, null, { timeout: 10000 }).catch(() => h.problems.push("the client never mounted"));
    h.check("hydrated: the window's width is heard (wide), the client signal turns, the client-only part renders", await h.until(async () => /wide, light/.test(await h.text(page, ".layout")) && /in the browser/.test(await h.text(page, ".where")) && /room for two columns/.test(await h.text(page, ".only"))), await h.text(page));
    h.check("the ticket the server made is the browser's (not made again)", !!sent && ticketOf(await h.text(page, ".ticket")) === sent, `${sent} / ${await h.text(page, ".ticket")}`);
    await page.setViewportSize({ width: 400, height: 600 });
    h.check("the media query follows the window", await h.until(async () => /narrow, light/.test(await h.text(page, ".layout")) && /one column/.test(await h.text(page, ".only"))), await h.text(page));
    await page.setViewportSize({ width: 800, height: 600 }); await h.until(async () => /wide/.test(await h.text(page, ".layout")));
    await page.click(".compact");
    h.check("an equation over a primitive's value and a source", await h.until(async () => /narrow, light/.test(await h.text(page, ".layout")) && /room for two columns/.test(await h.text(page, ".only"))), await h.text(page));
    await page.emulateMedia({ colorScheme: "dark" });
    h.check("the system's colour scheme is heard", await h.until(async () => /narrow, dark/.test(await h.text(page, ".layout")) && (await page.getAttribute("main", "class")) === "dark"), await h.text(page));
    await page.context().setOffline(true);
    h.check("the network going away is heard", await h.until(async () => /offline, in view/.test(await h.text(page, ".net"))), await h.text(page, ".net"));
    await page.context().setOffline(false);
    h.check("…and coming back", await h.until(async () => /online, in view/.test(await h.text(page, ".net"))), await h.text(page, ".net"));
    h.check("no console errors or warnings (no hydration mismatch)", h.problems.length === 0, h.problems);
  },
};
