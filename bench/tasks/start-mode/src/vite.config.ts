import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import rx from "@reactivescript/compiler/vite";
import { fileRoutes } from "filesystem-routing/vite";
// Solid's start mode: the plugin owns the entries, the dev server's render and the build (no index.html, no mount file,
// no server file). The app's root is an `.rx` component, named once: start mode takes its root as a file and writes
// the import itself, so the front end is told that file is a page (`pages`, 11 CP-4d: its default component, as an
// import with `?rx-page` would say). The routes are the `.rx` files of src/routes, scanned by filesystem-routing
// (SolidStart's conventions) into the manifest @solidjs/router's adapter makes its routes of. `ssr: true`: each request
// is rendered and streamed, and hydrated.
const app = "src/App.rx";
export default defineConfig({
  plugins: [
    fileRoutes({ extensions: ["rx"], types: "src/file-routes.d.ts", toRoute: (src, router) => ({ path: router.toPath(src), page: true, $component: { src: `${src}?rx-page`, pick: ["default"] }, $$route: undefined }) }),
    solid({ ssr: true, start: { app, nodeServer: true }, frontends: { ".rx": rx({ pages: [app] }) } }),
  ],
});
