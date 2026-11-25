// @ui-sdk/solid's own vitest config (Apache-2.0, vercel-labs/ui), with UI=rx,toggle,… taking ../src/<part> of a test from the .rx package.
import solid from "@solidjs/vite-plugin"
import { defineConfig } from "vitest/config"

const [ui, ...parts] = (process.env.UI ?? "").split(",")
const rx = ui === "rx" ? parts : []
const modules = process.cwd() + "/../../node_modules/"
const ours = {
  name: "ours", enforce: "pre" as const,
  resolveId(id: string, from?: string) {
    const part = /^\.\.\/src\/([a-z-]+)$/.exec(id)?.[1]
    if (part && from?.includes("/test/") && rx.includes(part)) return modules + "@rx-ui-sdk/solid/facade/" + part + ".js"
  },
}
const shared = { resolve: { dedupe: ["solid-js", "@solidjs/web", "@solidjs/signals"] } }
const inline = { deps: { inline: [/rx-ui-sdk/, /reactivescript/, /solid/] } }
export default defineConfig({
  test: {
    projects: [
      { ...shared, plugins: [ours, solid()], test: { name: "dom", environment: "jsdom", setupFiles: ["test/setup.ts"], include: ["test/**/*.test.{ts,tsx}"], exclude: ["test/**/*-ssr.test.{ts,tsx}"], server: inline } },
      { ...shared, plugins: [ours, solid({ ssr: true })], test: { name: "ssr", environment: "node", include: ["test/**/*-ssr.test.{ts,tsx}"], server: inline } },
    ],
  },
})
