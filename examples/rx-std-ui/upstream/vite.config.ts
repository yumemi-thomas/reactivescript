// @ui-sdk/solid's own playground config (Apache-2.0, vercel-labs/ui), with one change: UI=rx,toggle,… takes those modules from the .rx package.
import { svelte } from "@sveltejs/vite-plugin-svelte"
import react from "@vitejs/plugin-react"
import vue from "@vitejs/plugin-vue"
import solid from "@solidjs/vite-plugin"
import tailwind from "@tailwindcss/vite"
import { defineConfig } from "vite"
import { ssrFixtures } from "./ssr-plugin"
import { solidSsr } from "./solid-ssr.ts"

// Solid and React both compile .tsx, so each plugin takes its own files.
const solidFiles = [
  "**/packages/solid/**",
  "**/fixtures/*/solid*.tsx",
  "**/examples/*/solid/**",
  "**/examples/components/*/solid/**",
]

const [ui, ...parts] = (process.env.UI ?? "").split(",")
const rx = ui === "rx" ? parts : []

export default defineConfig({
  resolve: {
    dedupe: ["solid-js", "@solidjs/web", "@solidjs/signals"],
    alias: rx.map((part) => ({
      find: new RegExp(`^@ui-sdk/solid/${part}$`),
      replacement: new URL(`../../node_modules/@rx-ui-sdk/solid/facade/${part}.js`, import.meta.url).pathname,
    })),
  },
  ssr: { noExternal: ["@rx-ui-sdk/solid", "@reactivescript/runtime"] },
  optimizeDeps: { exclude: ["@rx-ui-sdk/solid", "@reactivescript/runtime"] },
  plugins: [
    react({ exclude: solidFiles }),
    vue(),
    svelte(),
    solid({ include: solidFiles, ssr: true }),
    solidSsr(),
    tailwind(),
    ssrFixtures(),
  ],
})
