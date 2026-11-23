// rx-verify's probe for host.d.rx (`rx-verify --dom src/host.d.rx`): the host's view, run. The scene is the routes the
// manifest makes of src/routes — `(app).rx` the layout of `(app)/index.rx` and `(app)/people/[id].rx` — given to
// @solidjs/router, with a recording component in place of each route file's page; `act` goes to the other page.
import { createRouter, useNavigate, useParams } from "@solidjs/router";
let navigate;
export const scene = (rx, h) => {
  const Router = createRouter({ routes: [{ path: "/", component: rx.Layout, children: [{ path: "/", component: rx.Home }, { path: "/people/:id", component: rx.Person }] }] });
  return () => h.s.createComponent(Router, { children: props => { navigate = useNavigate(); return props.children; } });
};
export const act = () => navigate("/people/1");
// a hook that reads the router's context: it throws where there is no router
export const uses = { router: () => useParams() };
