// The page's script: the .rx program is mounted, and the route files' components (pages.rx?rx-lib) are bound to its app.
import main from "./main.rx";
import { createApp } from "@reactivescript/runtime";
const app = createApp({ root: document.getElementById("app")! });
app.mount(main(app));
