// The app's own module around @tanstack/solid-router (09 MO-8r, MO-11f, MO-11i): the route tree as records, given to a
// factory that hands back the component that renders it — the shape @solidjs/router's `createRouter` has. TanStack's
// routes link to their parent (`getParentRoute`) and render their pages at `<Outlet />`; here a record's pages are in its
// `children`, and a layout is given the outlet as its `props.children`.
import { createComponent } from "solid-js";
import { createRootRoute, createRoute, createRouter, RouterProvider, Outlet } from "@tanstack/solid-router";

export function createAppRouter(tree) {
  const route = (record, parent) => {
    const component = () => createComponent(record.component, { get children() { return createComponent(Outlet, {}); } });
    const made = parent ? createRoute({ getParentRoute: () => parent, path: record.path, component }) : createRootRoute({ component });
    return record.children?.length ? made.addChildren(record.children.map(child => route(child, made))) : made;
  };
  const router = createRouter({ routeTree: route(tree) });
  return () => createComponent(RouterProvider, { router });
}
