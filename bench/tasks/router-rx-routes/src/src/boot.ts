// The page's script: the .rx program is mounted, and the route files' components (each imported ?rx-page by the generated tree) are bound to its app.
import main from "./main.rx";
import { createApp } from "@reactivescript/runtime";
const app = createApp({ root: document.getElementById("app")! });
app.mount(main(app));
