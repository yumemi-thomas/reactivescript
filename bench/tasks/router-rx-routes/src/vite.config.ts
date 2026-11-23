import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import solid from "@solidjs/vite-plugin";
// TanStack Router's file-based routing over `.rx` route files: `routeComponentExtensions` (the fork this task installs,
// ../vendor/README.md) has the generator take each `.rx` file of src/routes as a route whose component is the file's
// default component, imported as a page (`?rx-page`, 11 CP-4d), and write the route objects into src/routeTree.gen.ts.
export default defineConfig({
  plugins: [tanstackRouter({ target: "solid", autoCodeSplitting: true, routeComponentExtensions: { ".rx": "?rx-page" } }), solid()],
});
