// rx-verify's probe for host.d.rx (`rx-verify --dom src/host.d.rx`): the host's view, run. The declaration is derived
// from the routes directory (`//@ routes ./routes`, as the project's filesystem-routing scans and nests it), so the
// scene is too: rx-verify hands it the routes (`routes`: each with its path and the recording component that stands for
// its `.rx` route file), and the probe gives them to @solidjs/router. It names no route file. `rx.Router` is applied
// where the app's component applies the real one (`through`); `act` is called for each page, and goes to it.
import { createRouter, useNavigate } from "@solidjs/router";
import { createComponent } from "solid-js";
let navigate, Made;
export const scene = (rx, h, routes) => {
  const route = node => ({ path: node.path, component: node.component, ...(node.children.length ? { children: node.children.map(route) } : {}) });
  Made = createRouter({ routes: routes.map(route) });
  return () => h.s.createComponent(rx.App, { get children() { return h.s.createComponent(rx.Router, {}); } });
};
export const act = (rx, h, route) => navigate(route.path.replace(/:\w+/g, "1"));
// the component the host renders through: the router the app's router.ts makes
export const through = { Router: () => createComponent(Made, { children: props => { navigate = useNavigate(); return props.children; } }) };
