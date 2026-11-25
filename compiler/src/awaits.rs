//! R-1 / 07 §3 (`ref/src/awaits.ts`): the awaits of an equation that are not its result, each with the conditions under
//! which the equation reaches it (E-11: an arm not selected is not demanded, so its flight is not asked). The compiler
//! hoists each into its own async node, asked only while its guards hold; the equation reads it where the `await` was.

use crate::ast::{Expr, ExprKind, Markup, MarkupKind};
use crate::check::{children, Node};

#[derive(Clone, Copy)]
pub struct Guard<'a> {
    pub e: &'a Expr,
    pub neg: bool,
    pub nullish: bool,
}
pub struct Hoisted<'a> {
    /// an `ExprKind::Await`
    pub node: &'a Expr,
    pub guards: Vec<Guard<'a>>,
}

fn with<'a>(g: &[Guard<'a>], x: Guard<'a>) -> Vec<Guard<'a>> {
    let mut v = g.to_vec();
    v.push(x);
    v
}

/// `tail = false`: every await of `root` — a reader of a view, an effect's input or a provision, whose expression is not an
/// equation's own memo, so even its result-position `await` is a flight of its own (07 §3).
pub fn non_tail_awaits(root: &Expr, tail: bool) -> Vec<Hoisted<'_>> {
    let mut out = vec![];
    walk(Node::E(root), tail, &[], &mut out);
    out
}

fn walk<'a>(n: Node<'a>, tail: bool, g: &[Guard<'a>], out: &mut Vec<Hoisted<'a>>) {
    let g0 = |e| Guard { e, neg: false, nullish: false };
    if let Node::E(x) = n {
        match &x.k {
            ExprKind::Await { e, init, .. } => {
                if !tail {
                    out.push(Hoisted { node: x, guards: g.to_vec() });
                }
                walk(Node::E(e), false, g, out);
                if let Some(i) = init {
                    walk(Node::E(i), false, g, out);
                }
                return;
            }
            ExprKind::If { c, t, f } => {
                walk(Node::E(c), false, g, out);
                walk(Node::E(t), tail, &with(g, g0(c)), out);
                walk(Node::E(f), tail, &with(g, Guard { e: c, neg: true, nullish: false }), out);
                return;
            }
            ExprKind::Bin { op, l, r } => {
                walk(Node::E(l), false, g, out);
                match op.as_str() {
                    "&&" => walk(Node::E(r), false, &with(g, g0(l)), out),
                    "||" => walk(Node::E(r), false, &with(g, Guard { e: l, neg: true, nullish: false }), out),
                    "??" => walk(Node::E(r), false, &with(g, Guard { e: l, neg: false, nullish: true }), out),
                    _ => walk(Node::E(r), false, g, out),
                }
                return;
            }
            ExprKind::Catch { e, alt, .. } => {
                walk(Node::E(e), tail, g, out);
                walk(Node::E(alt), false, g, out);
                return;
            }
            // a closure's body runs later; a draft's statements are its own
            ExprKind::Fn { .. } | ExprKind::Draft { .. } => return,
            _ => {}
        }
    }
    for c in children(n, false) {
        walk(c, false, g, out);
    }
}

/// 07 §3: the expressions a region's own view reads — readers, attributes (not handlers), `if` conditions, `for` collections,
/// `loading on(…)` and fallbacks, `portal to(…)` — but not its sub-regions', which are hoisted where they are set up. An
/// `errored` fallback binds its error, so it stays out.
pub fn view_readers(ms: &[Markup]) -> Vec<&Expr> {
    let mut out = vec![];
    for m in ms {
        match &m.kind {
            MarkupKind::Read(e) => out.push(e),
            MarkupKind::El { attrs, children, .. } => {
                out.extend(attrs.iter().filter(|a| !is_handler(&a.name)).map(|a| &a.e));
                out.extend(view_readers(children));
            }
            MarkupKind::Mif { c, .. } => out.push(c),
            MarkupKind::Mfor { xs, .. } => out.push(xs),
            MarkupKind::Mview { .. } => {}
            MarkupKind::Loading { on, fallback, .. } => {
                out.extend(on.iter());
                out.extend(view_readers(fallback));
            }
            MarkupKind::Portal { to, .. } => out.extend(to.iter()),
            _ => {}
        }
    }
    out
}

/// What a view reads in its own place: not in a block (an `if` branch, a row, a boundary's content), which has an owner of its
/// own, nor in the children of a component that is `apart`.
fn in_place<'m>(ms: &'m [Markup], apart: &dyn Fn(&str) -> bool, out: &mut Vec<&'m Expr>) {
    for m in ms {
        match &m.kind {
            MarkupKind::Read(e) => out.push(e),
            MarkupKind::El { tag, attrs, children } => {
                out.extend(attrs.iter().map(|a| &a.e));
                if !apart(tag) {
                    in_place(children, apart, out);
                }
            }
            MarkupKind::Mif { c, .. } => out.push(c),
            MarkupKind::Mfor { xs, .. } => out.push(xs),
            MarkupKind::Loading { on, fallback, .. } => {
                out.extend(on.iter());
                in_place(fallback, apart, out);
            }
            MarkupKind::Errored { fallback, .. } => in_place(fallback, apart, out),
            MarkupKind::Portal { to, .. } => out.extend(to.iter()),
            _ => {}
        }
    }
}
/// What is written between `<P>` and `</P>`, as far as a context goes (RG-7b, 08).
pub enum InChildren {
    Neither,
    /// a `use` in their own place (`rx`: an .rx component's children are its own), and no `await`: they are owned where P
    /// shows them
    ReadsContext,
    /// an `await`, which is hoisted to where it is written …
    Awaits,
    /// … beside a `use` (proposals/bugs/36)
    AwaitsBesideContext,
}
/// … and all they read, where they hold an `await`.
pub fn in_children<'m>(kids: &[&'m Markup], rx: &dyn Fn(&str) -> bool) -> (InChildren, Vec<&'m Expr>) {
    fn within<'m>(e: &'m Expr, out: &mut Vec<&'m Expr>) {
        fn go<'m>(n: Node<'m>, out: &mut Vec<&'m Expr>) {
            if let Node::E(e) = n {
                out.push(e);
            }
            children(n, true).into_iter().for_each(|c| go(c, out));
        }
        go(Node::E(e), out)
    }
    let (mut own, mut all, mut every) = (vec![], vec![], vec![]);
    for k in kids {
        in_place(std::slice::from_ref(*k), rx, &mut own);
        in_place(std::slice::from_ref(*k), &|_| false, &mut all);
    }
    all.iter().for_each(|e| within(e, &mut every));
    let reads = |e: &Expr| crate::ast::reads_context(Node::E(e));
    if every.iter().any(|x| matches!(x.k, ExprKind::Await { .. })) {
        return if all.into_iter().any(reads) { (InChildren::AwaitsBesideContext, vec![]) } else { (InChildren::Awaits, every) };
    }
    (if own.into_iter().any(reads) { InChildren::ReadsContext } else { InChildren::Neither }, vec![])
}
/// Whether some module writes a fn that instantiates (E-9), its own or one it imports, other than as what is called: a value
/// that a call elsewhere may call where E-9 does not see it.
pub fn instantiating_fn_as_value(set: &crate::modules::ModuleSet) -> bool {
    use crate::ast::{instantiates, Decl};
    use crate::{parse::JsDecl, signature::ExportSig};
    use serde_json::Value;
    let own = |path: &str, name: &str| set.programs.get(path).is_some_and(|p| p.decls.iter().any(|d| matches!(d, Decl::Fn { name: n, params, decls, tail, .. } if n == name && instantiates(params, decls, tail))));
    fn mentions(v: &Value, names: &[&str]) -> bool {
        match v {
            Value::Array(xs) => xs.iter().any(|x| mentions(x, names)),
            Value::Object(o) => {
                let is = |k: &str| o.get("k").and_then(Value::as_str) == Some(k);
                (is("id") && o.get("name").and_then(Value::as_str).is_some_and(|n| names.contains(&n))) || o.iter().any(|(f, x)| !(is("call") && f == "f" && x["k"] == "id") && mentions(x, names))
            }
            _ => false,
        }
    }
    set.programs.values().any(|p| {
        let mut names: Vec<&str> = vec![];
        for d in &p.decls {
            match d {
                Decl::Fn { name, params, decls, tail, .. } if instantiates(params, decls, tail) => names.push(name),
                Decl::Import { names: ns, resolved, declared, .. } => names.extend(ns.iter().filter(|n| {
                    resolved.as_ref().is_some_and(|r| own(r, &n.name) || set.signatures.get(r).and_then(|s| s.exports.get(&n.name)).is_some_and(|x| matches!(x, ExportSig::Fn { instantiating: true, .. })))
                        || declared.as_ref().and_then(|f| set.declarations.get(f)).is_some_and(|ds| ds.iter().any(|x| matches!(x, JsDecl::Fn { name, uses, .. } if *name == n.name && !uses.is_empty())))
                }).map(|n| n.alias.as_str())),
                _ => {}
            }
        }
        !names.is_empty() && mentions(&p.to_json(), &names)
    })
}

/// `/^on[A-Z:]/`, or `ref` (called once with the element, 07 §4)
pub fn is_handler(name: &str) -> bool {
    let b = name.as_bytes();
    name == "ref" || (b.len() > 2 && b[0] == b'o' && b[1] == b'n' && (b[2].is_ascii_uppercase() || b[2] == b':'))
}

/// R-f-4 inside an equation: each `x catch alt` that is not the equation's result and holds no `await` — hoisted into one
/// boundary of its own, made once beside the equation, instead of a new boundary on every run of the equation's memo.
/// Its guards are the conditions under which the equation reaches it. Closures and drafts keep theirs.
pub fn inner_catches(root: &Expr) -> Vec<Hoisted<'_>> {
    let mut out = vec![];
    walk_catch(Node::E(root), true, &[], &mut out);
    out
}

fn walk_catch<'a>(n: Node<'a>, root: bool, g: &[Guard<'a>], out: &mut Vec<Hoisted<'a>>) {
    let g0 = |e| Guard { e, neg: false, nullish: false };
    if let Node::E(x) = n {
        match &x.k {
            ExprKind::Catch { e, alt, .. } => {
                if root {
                    walk_catch(Node::E(e), false, g, out);
                    walk_catch(Node::E(alt), false, g, out);
                } else if !has_await(x) {
                    out.push(Hoisted { node: x, guards: g.to_vec() });
                }
                return;
            }
            ExprKind::If { c, t, f } => {
                walk_catch(Node::E(c), false, g, out);
                walk_catch(Node::E(t), false, &with(g, g0(c)), out);
                walk_catch(Node::E(f), false, &with(g, Guard { e: c, neg: true, nullish: false }), out);
                return;
            }
            ExprKind::Bin { op, l, r } => {
                walk_catch(Node::E(l), false, g, out);
                match op.as_str() {
                    "&&" => walk_catch(Node::E(r), false, &with(g, g0(l)), out),
                    "||" => walk_catch(Node::E(r), false, &with(g, Guard { e: l, neg: true, nullish: false }), out),
                    "??" => walk_catch(Node::E(r), false, &with(g, Guard { e: l, neg: false, nullish: true }), out),
                    _ => walk_catch(Node::E(r), false, g, out),
                }
                return;
            }
            ExprKind::Fn { .. } | ExprKind::Draft { .. } | ExprKind::Await { .. } | ExprKind::Pre { .. } => return,
            _ => {}
        }
    }
    for c in children(n, false) {
        walk_catch(c, false, g, out);
    }
}

fn has_await(x: &Expr) -> bool {
    let mut hit = false;
    fn go(n: Node<'_>, hit: &mut bool) {
        if *hit { return; }
        if let Node::E(x) = n {
            match &x.k {
                ExprKind::Await { .. } | ExprKind::Pre { .. } => { *hit = true; return; }
                ExprKind::Fn { .. } => return,
                _ => {}
            }
        }
        for c in children(n, false) { go(c, hit); }
    }
    go(Node::E(x), &mut hit);
    hit
}

#[cfg(test)]
mod tests {
    use crate::emit::compile_linked;
    use crate::modules::load_modules;
    const HEAD: &str = "import pure { fetch } from \"./data.js\"\ncontext c: string = \"out\"\nfn r() { use c }\ncomponent P(props: { children?: View }) { provide c = \"in\"\n {loading fallback { <i>w</i> } { {props.children} }} }\ncomponent Seen(props: { v?: string }) { <b>{use c}{props.v}</b> }\n";
    fn said(main: &str, read: &dyn Fn(&str) -> Option<String>) -> String {
        let read = |f: &str| if f.ends_with("main.rx") { Some(main.to_string()) } else { read(f) };
        let set = load_modules("/a/main.rx", &read).unwrap_or_else(|e| panic!("{main}: {}", e.0));
        compile_linked(&set, &[], true).err().map(|e| e.0).unwrap_or_default()
    }
    fn app(decls: &str, view: &str) -> String {
        format!("{HEAD}export default component App() {{\n{decls}\n{view} }}\n")
    }
    const REFUSED: &str = "`await` outside an equation's result position is not lowered yet";

    /// proposals/bugs/36: asked, or shown beside what is read, where the children are written
    #[test]
    fn an_await_in_children_that_read_a_context_is_not_compiled() {
        for (decls, view) in [
            ("", "<P>{await fetch(use c)}</P>"),
            ("", "<P>{await* fetch(use c)}</P>"),
            ("", "<P>{use c}{await fetch(\"q\")}</P>"),
            ("", "<P>{use c}{false ? await fetch(use c) : \"!\"}</P>"),
            ("", "<P>{(use c) == \"in\" ? await fetch(\"q\") : \"\"}</P>"),
            ("", "<P><b class={await fetch(use c)}>x</b></P>"),
            ("", "<P>{await fetch(\"q\") catch (e) => use c}</P>"),
            ("", "<P>{await fetch(\"q\") -> use c}</P>"),
            ("", "<P><Seen v={use c} />{await fetch(\"q\")}</P>"),
            ("", "<P>{await fetch(r())}</P>"),
            ("g = r", "<P>{await fetch(g())}</P>"),
            ("g = { k: r }", "<P>{await fetch(g.k())}</P>"),
        ] {
            assert_eq!(said(&app(decls, view), &|_| None), REFUSED, "{decls} {view}");
        }
        // a prop given a reader in the module; a reader of another module; a JavaScript fn that reads a context
        let prop = format!("{HEAD}component M(props: {{ ask: () => string }}) {{ <P>{{await fetch(props.ask())}}</P> }}\nexport default component App() {{ <M ask={{r}} /> }}\n");
        assert_eq!(said(&prop, &|_| None), REFUSED);
        let far = |f: &str| match f {
            "/a/two.rx" => Some("context d: string = \"x\"\nexport fn r() { use d }\n".to_string()),
            "/a/js.d.rx" => Some("export context d\nexport pure fn useD(): string uses(d)\n".to_string()),
            _ => None,
        };
        for (import, call) in [("import { r as q } from \"./two.rx\"", "q()"), ("import { useD as q } from \"./js.js\"", "q()")] {
            assert_eq!(said(&format!("{import}\n{}", app("", &format!("<P>{{await fetch({call})}}</P>"))), &far), REFUSED, "{import}");
        }
    }
    /// proposals/bugs/37
    #[test]
    fn an_await_in_children_is_compiled() {
        for (decls, view) in [
            ("", "<P>{await fetch(\"q\")}</P>"),
            ("", "<P><p><P>{await fetch(\"q\")}</P></p>{await fetch(\"r\")}<Seen /></P>"),
            ("source k := \"c\"", "<P>{k ? await fetch(k) : \"c\"}<Seen v={await fetch(\"v\")} /></P>"),
            ("", "<Seen v={use c} /><P>{await fetch(\"q\")}</P>"),
            // a closure reads where it is written, and a name is the caller's equation
            ("", "<P>{if (use c) == \"in\" { <P>{await fetch(\"q\")}</P> }}</P>"),
            ("", "<P>{use c}</P><P>{await fetch(\"q\")}</P>"),
            ("v = use c", "<P>{await fetch(v)}</P>"),
            ("v = use c\nw = v + \"!\"", "<P>{await fetch(w)}</P>"),
            ("f = () => use c", "<P>{await fetch(f())}</P>"),
            ("source g := () => \"\"\nh = () => { g := () => use c }", "<P>{await fetch(g())}</P>"),
            ("g = [r].length", "<P>{await fetch(\"q\")}</P>"),
            ("v = use c\nx = await fetch(v)", "<b>{v}{x}</b><P>{await fetch(\"q\")}</P>"),
        ] {
            assert_eq!(said(&app(decls, view), &|_| None), "", "{decls} {view}");
        }
    }
}
