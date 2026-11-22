import { hydrate, render } from "@solidjs/web";
import { App } from "./app.tsx";

const root = document.getElementById("app")!;
if (root.firstChild) hydrate(() => <App />, root); else render(() => <App />, root);
(window as unknown as { __mounted: boolean }).__mounted = true;
