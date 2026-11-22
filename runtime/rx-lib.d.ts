// CP-4d (spec/11): `.rx` modules a JS host imports with `?rx-lib`, for a TypeScript that has no `.rx` support (an editor
// without the ReactiveScript extension, plain `tsc`): any name, untyped. `rx-tsc` types each import from its module's
// projection instead (`import { PersonCard } from "./pages.rx?rx-lib"` takes PersonCard's props); a resolved file wins
// over this pattern. Add it with `"types": ["@reactivescript/runtime/rx-lib"]`.
declare module "*.rx?rx-lib" {
  const untyped: any;
  export = untyped;
}
// … and a route file's page (`import Person from "./routes/people.rx?rx-page"`): the module's default component.
declare module "*.rx?rx-page" {
  const untyped: any;
  export = untyped;
}
