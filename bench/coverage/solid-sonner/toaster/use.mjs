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
    // the row itself, run: rx-verify renders the probe's scene (rx-types/solid-sonner.probe.mjs) against the library
    const v = spawnSync(process.execPath, ["--conditions=browser", path.join(h.dir, "../../node_modules/@reactivescript/language-server/bin/verify.js"), "--dom", "rx-types/solid-sonner.d.rx"], { cwd: h.dir, encoding: "utf8" });
    h.check("rx-verify: `renders(Toaster)` holds where solid-sonner is run — the component renders beneath the toaster", /solid-sonner\.d\.rx:\d+ ok\s+toast: placement holds: Saved beneath Toaster/.test(v.stdout) && !/MISMATCH/.test(v.stdout), v.stdout + v.stderr);
  },
  bad: [
    { name: "the app's context provided beside the toaster, not above it", edit: ["    <Toaster />\n  </Themed>\n", "  </Themed>\n  <Toaster />\n"], expect: "CONTEXT_NOT_FOUND" },
    { name: "no toaster in the program: nothing above the toast is known", edit: ["    <Toaster />\n", ""], expect: "CONTEXT_NOT_FOUND" },
    { name: "the row without the word: the toast is checked under a root of its own", file: "rx-types/solid-sonner.d.rx", edit: [" renders(Toaster)", ""], expect: "CONTEXT_NOT_FOUND" },
  ],
  note: "one of the three libraries whose row says `renders(<Component>)` (09 MO-11u, MO-8r). the row is the draft's (the word from known.js). A component that declares no props is the function of nothing the library's type asks for (13 TY-3d). `toast.custom(fn)` is not declared: it calls `fn` with no owner at all (found by running it: `getOwner()` is null there, and in Solid's development build `useContext` throws NoOwnerError), which no row describes (MO-11s)" });
