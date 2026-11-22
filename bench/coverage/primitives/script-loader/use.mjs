import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/script-loader", title: "a script loader: its options narrowed to a record whose load callback writes", ssr: /loading the widget/, before: async page => { await page.route(/widgets\.test/, r => r.fulfill({ contentType: "text/javascript", body: "window.__widget = 1;" })); }, dom: /widget loaded/ });
