// What `rx-declare` knows of a library that its types cannot show (09 MO-8k): for a package it has been checked against,
// the rows a person would otherwise write by hand over the draft — that a factory nests what it is given (`nests(…)`,
// MO-11i), the context its provider provides and its hooks read (MO-12), a callback the library calls later (`handler`,
// MO-10g), an accessor that waits or fails where it is read (`pending`, `fails(…)` before its `ref`, MO-10l), and `pure`
// for a primitive that writes nothing but its own state (MO-8a). Each entry is for a version range: outside it the draft
// is the types' alone, with its TODOs.
//
// These are facts about the named release, checked by running it (bench/tasks, compiler/test), not conventions read
// off a name: a draft still never guesses `pure` (RFC 26). A row here replaces the drafted row of the same export when
// the installed package exports it; the draft says which rows it took from here.
//
// `rows`: export name → its row. `contexts`: the contexts the rows name. `words`: export name → words added to the
// drafted row as it is (`pure` before `fn`, `after` after the row, `waits` before a `ref` part of its result: `""` the
// whole result, else a tuple's index or a record's field), for an export whose drafted types are right.
module.exports = {
  "@tanstack/solid-router": {
    range: ">=2.0.0-rc.0 <3.0.0",
    contexts: ["router"],
    // its route tree is built from values (`createRoute`, `createRouter`): rows with no word, so a component given to
    // one is checked under a root of its own (MO-11s). An app gives its tree to a factory of its own (guide/libraries.md)
    rows: {
      Link: "export component Link(props: { to: string; params?: Parameters<typeof import(\"@tanstack/solid-router\").Link>[0][\"params\"]; children?: View }) uses(router)",
    },
    // its hooks read the router's context; their types are the library's, as drafted
    words: { useParams: { pure: true, after: "uses(router)" }, RouterProvider: { after: "provides(router)" }, Outlet: { after: "uses(router)" } },
  },
  "@solidjs/router": {
    range: ">=2.0.0 <3.0.0",
    contexts: ["router"],
    rows: {
      // the factory provides the router and nests each route's children in its component (MO-11i); `defineRoute` is pure,
      // so its call in the route table hands its component on to the factory (MO-11g)
      createRouter: "export pure fn createRouter(config: { routes: RouteDefinition[] }): Component provides(router) nests(children in component)",
      defineRoute: "export pure fn defineRoute<const S extends string | readonly string[]>(route: { path: S; component?: Component<{ params: RouteParams<S>; children?: View }>; children?: RouteDefinition[] }): RouteDefinition",
      useSubmissions: "export pure fn useSubmissions<T extends unknown[], U, V>(fn_: import(\"@solidjs/router\").FormAction<T, U, V>, filter?: (input: V) => boolean): { input: V; result?: unknown; error: unknown }[] uses(router)",
    },
  },
  // accessors that wait for a first value, read off the release's own source: `data` throws Solid's NotReadyError until
  // the first message and the stream's error after one; `location` until the first fix (its errors are `error`'s)
  "@solid-primitives/sse": { range: ">=1.0.0 <2.0.0", words: { createSSE: { waits: { data: "pending fails(Error)" } } } },
  "@solid-primitives/geolocation": { range: ">=3.0.0 <4.0.0", words: { createGeolocationWatcher: { waits: { location: "pending" } } } },
  "@tanstack/solid-query": {
    range: ">=6.0.0-rc.0 <7.0.0",
    contexts: ["queryClient"],
    rows: {
      QueryClientProvider: "export component QueryClientProvider(props: { client: import(\"@tanstack/solid-query\").QueryClient; children?: View }) provides(queryClient)",
      useMutation: "export pure fn useMutation<TData = unknown, TVariables = void>(ref options: { mutationFn: (v: TVariables) => Promise<TData>; onSuccess?: handler () => void }): { mutate: (v: TVariables) => Promise<TData>; isPending: boolean; status: string; reset: () => void } uses(queryClient)",
    },
    words: { useQueryClient: { pure: true, after: "uses(queryClient)", drop: "instantiates" } },
  },
};
