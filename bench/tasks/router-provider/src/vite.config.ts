import { defineConfig } from "vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import solid from "@solidjs/vite-plugin";
// TanStack Router's file-based routing: its plugin writes src/routeTree.gen.ts from src/routes
export default defineConfig({ plugins: [tanstackRouter({ target: "solid", autoCodeSplitting: false }), solid()] });
