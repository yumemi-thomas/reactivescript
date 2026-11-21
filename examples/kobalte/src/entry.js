import { createApp } from "@reactivescript/runtime";
import main from "./main.rx";
const app = createApp({ root: document.getElementById("app") });
app.mount(main(app));
