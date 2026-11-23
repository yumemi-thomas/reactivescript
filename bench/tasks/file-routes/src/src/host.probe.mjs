// rx-verify's probe for host.d.rx (`rx-verify --dom src/host.d.rx`): the host's view, run. The scene is what the app
// does — its component around the router's — with the routes the manifest makes of src/routes (`(app).rx` the layout
// of `(app)/index.rx` and `(app)/people/[id].rx`) given to @solidjs/router, a recording component in place of each
// `.rx` one, and `rx.Router` applied where the app's component applies the real one (`through`); `act` goes to the
// other page.
import { createRouter, useNavigate } from "@solidjs/router";
import { createComponent } from "solid-js";
let navigate, Made;
export const scene = (rx, h) => {
  Made = createRouter({ routes: [{ path: "/", component: rx.Layout, children: [{ path: "/", component: rx.Home }, { path: "/people/:id", component: rx.Person }] }] });
  return () => h.s.createComponent(rx.App, { get children() { return h.s.createComponent(rx.Router, {}); } });
};
export const act = () => navigate("/people/1");
// the component the host renders through: the router the app's router.ts makes
export const through = { Router: () => createComponent(Made, { children: props => { navigate = useNavigate(); return props.children; } }) };
