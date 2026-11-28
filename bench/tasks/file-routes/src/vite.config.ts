import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import { fileRoutes } from "filesystem-routing/vite";
// File-system routing over `.rx` route files (filesystem-routing: SolidStart's conventions, for any router). A route
// file is a page when it has a default component, and the manifest imports it as that component (`?rx-page`, 11 CP-4d);
// `types` writes the manifest as a literal tuple, which is what types the router's `paths`.
export default defineConfig({
  plugins: [
    fileRoutes({ extensions: ["rx"], types: "src/file-routes.d.ts", toRoute: (src, router) => ({ path: router.toPath(src), page: true, $component: { src: `${src}?rx-page`, pick: ["default"] }, $$route: undefined }) }),
    solid(),
  ],
});
