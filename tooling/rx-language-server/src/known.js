// What `rx-declare` knows of a library that its types cannot show (09 MO-8k): for a package it has been checked against,
// the rows a person would otherwise write by hand over the draft — where a router renders the components its routes are
// given (`renders(later)`, a prop that `renders`, MO-11o), which route nests under which (`nests(…)`, MO-11i), the
// context its provider provides and its hooks read (MO-12), a query whose `data` waits and throws where it is read
// (MO-10f), a callback the library calls inside its own computation (`tracked`) or later (`handler`, MO-10g), and `pure`
// for a primitive that writes nothing but its own state (MO-8a). Each entry is for a version range: outside it the draft
// is the types' alone, with its TODOs.
//
// These are facts about the named release, checked by running it (bench/tasks, compiler/test), not conventions read
// off a name: a draft still never guesses `pure` (RFC 26). A row here replaces the drafted row of the same export when
// the installed package exports it; the draft says which rows it took from here.
//
// `rows`: export name → its row. `contexts`: the contexts the rows name. `words`: export name → words added to the
// drafted row as it is (`pure` before `fn`, the rest after the row), for an export whose drafted types are right.
module.exports = {
  "@tanstack/solid-router": {
    range: ">=2.0.0-rc.0 <3.0.0",
    contexts: ["router"],
    rows: {
      // a route carries the components it is given: the router renders them under <RouterProvider>, a child route at
      // its parent's <Outlet /> (MO-11o, MO-11p)
      createRootRoute: "export pure fn createRootRoute(options: { component?: Component }): any renders(later) methods(addChildren)",
      createRoute: "export pure fn createRoute(options: { getParentRoute: () => any; path: string; component?: Component }): any renders(later) methods(addChildren) nests(component under getParentRoute)",
      createRouter: "export pure fn createRouter(options: { routeTree: any }): any instantiates",
      RouterProvider: "export component RouterProvider(props: { router: renders any }) provides(router)",
      Outlet: "export component Outlet(props: {}) uses(router) outlet",
      Link: "export component Link(props: { to: string; params?: any; children?: View }) uses(router)",
      useParams: "export pure fn useParams(opts: { from: string }): ref any uses(router)",
    },
  },
  "@solidjs/router": {
    range: ">=2.0.0 <3.0.0",
    contexts: ["router"],
    rows: {
      // the factory provides the router and nests each route's children in its component, joining their paths (MO-11i)
      createRouter: "export pure fn createRouter(config: { routes: RouteDefinition[] }): Component provides(router) nests(children in component) joins(path)",
      defineRoute: "export pure fn defineRoute<const S extends string | readonly string[]>(route: { path: S; component?: Component<{ params: RouteParams<S>; children?: View }>; children?: RouteDefinition[] }): RouteDefinition forwards",
      useSubmissions: "export pure fn useSubmissions(fn_: any, filter?: (...args: any[]) => any): { input: any; result?: any; error: any }[] uses(router)",
    },
  },
  "@tanstack/solid-query": {
    range: ">=6.0.0-rc.0 <7.0.0",
    contexts: ["queryClient"],
    rows: {
      QueryClientProvider: "export component QueryClientProvider(props: { client: any; children?: View }) provides(queryClient)",
      // `data` waits and throws where it is read (MO-10f); `queryFn` is called inside the library's computation (MO-10g)
      useQuery: "export pure fn useQuery(ref options: { queryKey: any[]; queryFn: tracked () => Promise<any> }): { data: pending fails(Error) any; isFetching: boolean; status: string; refetch: () => Promise<any> } uses(queryClient)",
      useMutation: "export pure fn useMutation(ref options: { mutationFn: (v: any) => Promise<any>; onSuccess?: handler () => void }): { mutate: (...args: any[]) => Promise<any>; isPending: boolean; status: string; reset: () => void } uses(queryClient)",
    },
    words: { useQueryClient: { pure: true, after: "uses(queryClient)", drop: "instantiates" } },
  },
};
