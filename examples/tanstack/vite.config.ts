import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import solid from "@solidjs/vite-plugin";
// TanStack Router's file-based routing: its plugin writes routeTree.gen.ts from routes/ (the route files are TSX: the
// generator takes .ts, .tsx, .js, .jsx and .vue, and reads a route file as JavaScript).
export default defineConfig({ plugins: [tanstackRouter({ target: "solid", routesDirectory: "./routes", generatedRouteTree: "./routeTree.gen.ts", autoCodeSplitting: false }), solid()] });
