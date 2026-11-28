// W3 (track 2, step c): a read that fails after the shell, inside a `<Loading>` of a part, with the `<Errored>` that
// catches it above the part — Solid's server streams the boundary as an empty fragment where DV-9's shape (the
// `<Errored>` right around the `<Loading>`) streams the fallback. Plain Solid, no ReactiveScript.
// node repros/w3-error-through-a-part.mjs [direct|part|prop] [ms]      (default conditions: the server build)
//   direct: <Errored><Loading>{user().name}</Loading></Errored>                   (DV-9's repro)
//   part:   <Errored><Q /></Errored>, Q = <b><Loading>{user().name}</Loading></b>
//   prop:   <Errored><Q l={user().name} /></Errored>, Q = <b><Loading>{props.l}</Loading></b>   (the .rx program's shape)
import { createMemo, Loading, Errored, createComponent } from "solid-js";
import { renderToStream, ssr, escape, markSafeError } from "@solidjs/web";
const shape = process.argv[2] ?? "prop"; const ms = Number(process.argv[3] ?? 200);
let reject; const p = new Promise((_, j) => (reject = j)); p.catch(() => {});
const loading = body => createComponent(Loading, { fallback: ssr(["<i>q</i>"]), get children() { return body(); } });
function Q(props) { return ssr(["<b>", "</b>"], loading(() => shape === "prop" ? ssr(["<u>", "</u>"], () => escape(props.l)) : ssr(["<u>", "</u>"], () => escape(props.user().name)))); }
function App() {
  const user = createMemo(() => p);
  return ssr(["<main>", "</main>"], createComponent(Errored, {
    fallback: e => ssr(["<p>bad: ", "</p>"], escape(e().message)),
    get children() {
      if (shape === "direct") return loading(() => ssr(["<u>", "</u>"], () => escape(user().name)));
      if (shape === "part") return createComponent(Q, { user });
      return createComponent(Q, { get l() { return user().name; } });
    },
  }));
}
renderToStream(() => createComponent(App, {})).pipe({ write: c => console.log(c.replace(/<script>[\s\S]*?<\/script>/g, "")), end() {} });
setTimeout(() => reject(markSafeError(new Error("no"))), ms);
