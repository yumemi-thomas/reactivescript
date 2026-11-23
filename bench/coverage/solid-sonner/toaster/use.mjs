import { use } from "../../../cover.mjs";
import { spawnSync } from "node:child_process";
import path from "node:path";
export default use(import.meta, { pkg: "solid-sonner", title: "a toast given a component of the app's, rendered by <Toaster> under the app's context", ssr: false, server: "the package's default build is compiled for the DOM (its `solid` condition is the source an app's bundler compiles); the benchmark imports a package as Node resolves it",
  dom: async (h, page) => {
    await page.click(".note");
    h.check("a message shown from a handler is rendered by the toaster", await h.until(async () => /a plain note/.test(await h.text(page, "body"))), await h.text(page, "body"));
    await page.click(".save");
    h.check("a component given to toast() is rendered by the toaster", await h.until(async () => /saved to disk/.test(await h.text(page, "body"))), await h.text(page, "body"));
    h.check("…beneath it: the component reads the context provided above <Toaster>", await h.until(async () => await page.locator("[data-sonner-toaster] b.dark").count() === 1), await page.locator("body").innerHTML().catch(() => ""));
    await page.click(".done");
    h.check("a toast shown by the toaster's method, from a handler", await h.until(async () => /exported/.test(await h.text(page, "body"))), await h.text(page, "body"));
    await page.click(".clear");
    h.check("…and the toasts dismissed by another", await h.until(async () => !/exported/.test(await h.text(page, "body")), 300), await h.text(page, "body"));
    // the row itself, run: rx-verify renders the probe's scene (rx-types/solid-sonner.probe.mjs) against the library
    const v = spawnSync(process.execPath, ["--conditions=browser", path.join(h.dir, "../../node_modules/@reactivescript/language-server/bin/verify.js"), "--dom", "rx-types/solid-sonner.d.rx"], { cwd: h.dir, encoding: "utf8" });
    h.check("rx-verify: `renders(Toaster)` holds where solid-sonner is run — the component renders beneath the toaster", /solid-sonner\.d\.rx:\d+ held\s+toast: placement holds: Saved beneath Toaster/.test(v.stdout) && !/MISMATCH/.test(v.stdout), v.stdout + v.stderr);
  },
  bad: [
    { name: "the app's context provided beside the toaster, not above it", edit: ["    <Toaster />\n  </Themed>\n", "  </Themed>\n  <Toaster />\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "no toaster in the program: nothing above the toast is known", edit: ["    <Toaster />\n", ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "a toast shown while the view computes: the method's row says io", edit: ['  <button class="note"', '  <i>{toast.success("exported")}</i>\n  <button class="note"'], expect: "IO_IN_REACTIVE" },
    { name: "the toaster's method called where the handler is given", edit: ["onClick={() => { toast.dismiss() }}", "onClick={toast.dismiss()}"], expect: "IO_IN_REACTIVE" },
    { name: "a component given to toast.custom, which calls it with no owner: checked under a root of its own, it reads no context", edit: ["toast(Saved) }}>save", "toast.custom(Saved) }}>save"], expect: "CONTEXT_NOT_FOUND" },
    { name: "the row without the word: the toast is checked under a root of its own", file: "rx-types/solid-sonner.d.rx", edit: [" renders(Toaster)", ""], expect: "CONTEXT_NOT_FOUND" },
  ],
  note: "one of the three libraries whose row says `renders(<Component>)` (09 MO-11u, MO-8r). the row is the draft's (the word from known.js). A component that declares no props is the function of nothing the library's type asks for (13 TY-3d). Its methods have rows of their own (MO-8t, 2026-11-25), the draft's: `toast.success(…)` in a view was accepted, and shows a toast on every computation (run). `toast.custom(fn)` has a row with no `renders(…)`: it calls `fn` with no owner at all (found by running it: `getOwner()` is null there, and in Solid's development build `useContext` throws NoOwnerError), which no row describes (MO-11s)" });
