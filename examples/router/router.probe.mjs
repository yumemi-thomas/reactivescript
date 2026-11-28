// rx-verify's probe for router.d.rx (`rx-verify --dom router.d.rx`). The scene checks createRouter's placement rows by
// running: a factory (what it is given renders inside the Router it makes) with nests(children in component) (a nested
// route's page renders inside its layout). The probes give useSubmissions an action and defineRoute a route.
import { action, createRouter } from "@solidjs/router";
export const scene = (lib, h) => {
  const Layout = h.component("Layout", props => props.children);
  const Page = h.component("Page");
  const Router = lib.createRouter({ routes: [lib.defineRoute({ path: "/", component: Layout, children: [lib.defineRoute({ path: "/", component: Page })] })] });
  return () => h.s.createComponent(Router, {});
};
export const probes = {
  defineRoute: { args: () => [{ path: "/people/:id" }] },
  useSubmissions: { args: () => [action(async () => 1, "probe")] },
};
// the providers a hook with arguments needs (useSubmissions' fields are read under them): a router whose route renders them
export const provide = (children, s) => s.createComponent(createRouter({ routes: [{ path: "/", component: () => children() }] }), {});
