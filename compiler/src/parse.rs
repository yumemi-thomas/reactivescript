//! The parser: `ref/src/parse.ts`, a hand-rolled scanner and recursive descent over `.rx` text (07). It produces the same
//! tree, and fails with the same messages, as the reference; `ref/crate.ts` diffs the two on every scenario program.

use crate::ast::*;
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

#[derive(Debug, Clone, PartialEq)]
/// What failed to parse; where (a byte offset), and in which file, when known; and its code: the habit `hint` recognised
/// (guide/diagnostics.md), else `PARSE`.
pub struct ParseError(pub String, pub Option<usize>, pub Option<String>, pub &'static str);
impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}
type R<T> = Result<T, ParseError>;

macro_rules! re {
    ($name:ident, $pat:expr) => {
        static $name: LazyLock<Regex> = LazyLock::new(|| Regex::new($pat).unwrap());
    };
}
re!(IDENT, r"^[A-Za-z_$][A-Za-z0-9_$]*");
re!(TAG, r"^[A-Za-z_$][A-Za-z0-9_$:.\-]*");
re!(SPLIT_KEY, r"^([\s\S]*?)\s+key\s+([A-Za-z_$][A-Za-z0-9_$]*)$");
re!(SOURCE_KEY, r"^key\s+[A-Za-z_$][A-Za-z0-9_$]*\s*(=|:=)[^=>]");
re!(EQ_KEY, r"^key\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=[^=>]");
re!(IMPORT_SIDE, r"^(server|client)\s+(pure[^A-Za-z0-9_]|pure$|\{)");
re!(ERROR_DECL, r"^error\s+[A-Z]");
re!(TYPE_DECL, r"^(type|interface)([^A-Za-z0-9_]|$)");
re!(SERVER_DECL, r"^server\s+(fn|action)([^A-Za-z0-9_]|$)");
re!(WRITE_AHEAD, r"^[A-Za-z_$][A-Za-z0-9_$.\[\]]*\s*:=");
re!(DRAFT, r"^draft\s*\(");
re!(BRACE_AHEAD, r"^\s*\{");
re!(STYLE, r"^<style([^A-Za-z0-9_]|$)");
re!(SERVER_FN_EXPR, r"^server\s+fn\s*\(");
re!(NUMBER, r"^\d[\d_]*(\.\d+)?");
re!(REJECTS, r"(^|[^A-Za-z0-9_])rejects\(");

static KEYWORDS: LazyLock<HashSet<&'static str>> = LazyLock::new(|| {
    [
        "source", "effect", "component", "ref", "await", "latest", "loading", "errored", "fallback", "on", "deferred", "action", "guess", "refresh", "affects", "if", "else", "pre", "peek", "fn", "let", "for", "in", "true", "false", "undefined",
        "null", "provide", "context", "use", "import", "export", "from", "pure", "return", "type", "interface", "try", "catch", "finally", "throw", "portal",
    ]
    .into_iter()
    .collect()
});
fn is_kw(s: &str) -> bool {
    KEYWORDS.contains(s)
}
fn is_ident_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_' || c == '$'
}

/// An expression from `start` to where the cursor is.
fn ex(start: usize, k: ExprKind, c: &Cursor) -> Expr {
    Expr::new(k, Span::new(start, c.i))
}
/// A statement from `start` to where the cursor is.
/// The line a statement that starts at `start` is on.
fn st_line(start: usize, c: &Cursor) -> u32 {
    (c.src[..start.min(c.src.len())].bytes().filter(|b| *b == b'\n').count() + 1) as u32
}
fn st(start: usize, k: StmtKind, c: &Cursor) -> Stmt {
    Stmt { k, span: Span::new(start, c.i), line: st_line(start, c) }
}

/// A position in the source, in bytes, always on a char boundary. `peek` at the end is `'\0'` (the reference's `""`).
pub struct Cursor<'a> {
    pub src: &'a str,
    pub i: usize,
    /// an editor's parse (CP-8e): a missing member name or expression is an error recorded in `errors`, and the parse goes
    /// on with an empty one, so that what is being typed still projects
    pub recover: bool,
    pub errors: Vec<ParseError>,
    /// a destructuring `let` (07 §5) is several statements: the rest of them, after the first
    pub pending: Vec<Stmt>,
    /// `$$n`: the bound value of a destructuring whose right side is not a name (RG-4b)
    pub temps: usize,
    /// the names this module imports so far (a hook's pair is a habit only when it is not one of them)
    pub imported: std::collections::HashSet<String>,
}
impl<'a> Cursor<'a> {
    pub fn new(src: &'a str) -> Self {
        Cursor { src, i: 0, recover: false, errors: vec![], pending: vec![], temps: 0, imported: std::collections::HashSet::new() }
    }
    /// What `fail` would return, recorded instead (`recover`).
    fn note(&mut self, msg: &str) {
        if let Err(e) = self.fail::<()>(msg) {
            self.errors.push(e);
        }
    }
    /// A member's name; in an editor's parse, `x.` with none yet is `x.` with an empty one.
    fn member(&mut self) -> R<String> {
        if self.recover && self.peek_ident().is_none() {
            self.note("member");
            return Ok(String::new());
        }
        self.ident_or("member")
    }
    pub fn line(&self) -> usize {
        self.src[..self.i].bytes().filter(|b| *b == b'\n').count() + 1
    }
    pub fn eof(&self) -> bool {
        self.i >= self.src.len()
    }
    pub fn rest(&self) -> &'a str {
        &self.src[self.i.min(self.src.len())..]
    }
    pub fn peek(&self) -> char {
        self.rest().chars().next().unwrap_or('\0')
    }
    pub fn peek_at(&self, n: usize) -> char {
        self.rest().chars().nth(n).unwrap_or('\0')
    }
    /// One character on (the reference's `c.i++`).
    pub fn bump(&mut self) {
        if let Some(c) = self.rest().chars().next() {
            self.i += c.len_utf8();
        } else {
            self.i += 1;
        }
    }
    pub fn ws(&mut self, newlines: bool) {
        loop {
            let c = self.peek();
            if c == ' ' || c == '\t' || c == '\r' || (newlines && c == '\n') {
                self.bump();
            } else if c == '/' && self.peek_at(1) == '/' {
                while !self.eof() && self.peek() != '\n' {
                    self.bump();
                }
            } else if c == '/' && self.peek_at(1) == '*' {
                match self.src[self.i + 2..].find("*/") {
                    Some(j) => self.i = self.i + 2 + j + 2,
                    None => self.i = self.src.len(),
                }
            } else {
                break;
            }
        }
    }
    pub fn starts_with(&self, s: &str) -> bool {
        self.rest().starts_with(s)
    }
    pub fn eat(&mut self, s: &str) -> bool {
        if self.starts_with(s) {
            self.i += s.len();
            true
        } else {
            false
        }
    }
    pub fn expect(&mut self, s: &str) -> R<()> {
        if !self.eat(s) {
            return self.fail(&format!("expected '{}'", s));
        }
        Ok(())
    }
    pub fn fail<T>(&self, msg: &str) -> R<T> {
        let near: String = self.rest().chars().take(20).collect();
        let near = near.split('\n').next().unwrap_or("");
        let near = if near.trim().is_empty() { "at the end of the line".to_string() } else { format!("near '{}'", near) };
        let h = hint(self.src, self.i, msg);
        let tail = h.as_ref().map(|(_, t)| format!(" — {}", t)).unwrap_or_default();
        Err(ParseError(format!("line {}: {} {}{}", self.line(), msg, near, tail), Some(self.i), None, h.map(|(c, _)| c).unwrap_or("PARSE")))
    }
    pub fn ident(&mut self) -> Option<String> {
        let m = IDENT.find(self.rest())?;
        let s = m.as_str().to_string();
        self.i += s.len();
        Some(s)
    }
    fn tag_name(&mut self) -> Option<String> {
        let m = TAG.find(self.rest())?;
        let s = m.as_str().to_string();
        self.i += s.len();
        Some(s)
    }
    pub fn peek_ident(&self) -> Option<String> {
        IDENT.find(self.rest()).map(|m| m.as_str().to_string())
    }
    pub fn keyword(&mut self, k: &str) -> bool {
        let save = self.i;
        if self.ident().as_deref() == Some(k) && !is_ident_char(self.peek()) {
            return true;
        }
        self.i = save;
        false
    }
    fn ident_or(&mut self, what: &str) -> R<String> {
        match self.ident() {
            Some(s) => Ok(s),
            None => self.fail(what),
        }
    }
}

/// A TypeScript type, kept as text: balanced up to a depth-0 stop (`=`, `:=`, `,`, `)`, `=>`, `{` when `brace_stops`). 07 §2.
/// A type's text, up to where the declaration goes on. `=>` inside brackets is a function type, as it is anywhere in
/// a type alias (`arrows`); elsewhere at the top it starts a body (`fn f(): T => …`).
fn parse_type(c: &mut Cursor, brace_stops: bool, arrows: bool) -> R<String> {
    let start = c.i;
    let mut depth: i64 = 0;
    while !c.eof() {
        if c.starts_with("=>") && (depth > 0 || arrows) {
            c.bump();
            c.bump();
            continue;
        }
        let ch = c.peek();
        if depth == 0 && (c.starts_with("//") || c.starts_with("=>") || c.starts_with(":=") || ch == '=' || ch == ',' || ch == ')' || ch == ';' || ch == '\n' || (brace_stops && ch == '{')) {
            break;
        }
        if ch == '"' || ch == '\'' || ch == '`' {
            // a string literal type is one token: a `//`, `,` or `)` inside it does not end the type
            c.bump();
            while !c.eof() && c.peek() != ch && c.peek() != '\n' {
                if c.peek() == '\\' {
                    c.bump();
                }
                c.bump();
            }
            if !c.eof() && c.peek() == ch {
                c.bump();
            }
            continue;
        }
        if "([{<".contains(ch) {
            depth += 1;
        } else if ")]}>".contains(ch) {
            depth -= 1;
        }
        c.bump();
    }
    let t = js_trim(&c.src[start..c.i]).to_string();
    if t.is_empty() {
        return c.fail("type");
    }
    Ok(t)
}
pub fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
}
/// `x: T key k = …` (ST-4): the type ends where the key begins.
fn split_key(ty: Option<String>) -> (Option<String>, Option<String>) {
    if let Some(t) = &ty {
        if let Some(m) = SPLIT_KEY.captures(t) {
            return (Some(m[1].to_string()), Some(m[2].to_string()));
        }
    }
    (ty, None)
}
fn opt_type(c: &mut Cursor, brace_stops: bool) -> R<Option<String>> {
    c.ws(false);
    if c.peek() == ':' && c.peek_at(1) != '=' {
        c.bump();
        c.ws(true);
        return Ok(Some(parse_type(c, brace_stops, false)?));
    }
    Ok(None)
}
/// R-f: `A | B` — error class names. `Error` (or TS's `unknown`/`any`) is every failure: `None`.
fn parse_classes(c: &mut Cursor) -> R<Option<Vec<String>>> {
    let mut out = vec![];
    loop {
        c.ws(true);
        out.push(c.ident_or("error class")?);
        c.ws(false);
        if c.peek() == '|' && c.peek_at(1) != '|' {
            c.bump();
            continue;
        }
        break;
    }
    if out.iter().any(|n| n == "Error" || n == "unknown" || n == "any") {
        return Ok(None);
    }
    Ok(Some(out))
}

re!(JS_APIS, r"\b(useState|useReducer|useMemo|useCallback|useEffect|useRef|createSignal|createMemo|createEffect|createStore|createResource|createAsync)\s*\(");
re!(JS_FUNCTION, r"^(export\s+)?(default\s+)?(async\s+)?function\b");
re!(JS_LOCAL, r"^(const|let|var)\b");
re!(JS_RETURN, r"^return\b");
re!(NAME_BEFORE, r"([A-Za-z_$][A-Za-z0-9_$.]*)\s*$");
re!(ARROW_BEFORE, r"=>\s*[A-Za-z_$][A-Za-z0-9_$.]*\s*$");
re!(OP_ASSIGN, r"^(\+\+|--|(\*\*|\|\||&&|\?\?|[-+*/%])=)");

/// What a parse failure at `i` most likely meant, when the line reads like JavaScript, React or Solid: its code and the
/// text appended to the message. `ref/src/parse.ts` `hint` is the same function.
pub fn hint(src: &str, i: usize, msg: &str) -> Option<(&'static str, String)> {
    let i = i.min(src.len());
    let rest = &src[i..];
    let at = if !rest.is_empty() && !rest.split('\n').next().unwrap_or("").trim().is_empty() { i as i64 } else { src[..i].trim_end().len() as i64 - 1 };
    let p = at.max(0) as usize;
    let start = if p == 0 { 0 } else { src[..p].rfind('\n').map(|j| j + 1).unwrap_or(0) };
    let end = src[p..].find('\n').map(|j| p + j).unwrap_or(src.len());
    let line = src[start..end].trim();
    let before = &src[src[..i].rfind('\n').map(|j| j + 1).unwrap_or(0)..i];
    let name = NAME_BEFORE.captures(before).map(|c| c[1].to_string()).unwrap_or_else(|| "x".into());
    if msg.starts_with("W-2") && rest.starts_with(":=") && ARROW_BEFORE.is_match(before) {
        return Some(("REACTIVE_WRITE_IN_OWNED_SCOPE", format!("an arrow that writes takes a braced body, `() => {{ {} := … }}`: an expression-bodied arrow is a pure function (SC-3)", name)));
    }
    if OP_ASSIGN.is_match(rest) || (rest.starts_with('=') && !rest[1..].starts_with('=') && !rest[1..].starts_with('>')) {
        return Some(("ASSIGNMENT", format!("a source is written with `:=`, as a statement in a handler or action: `{n} := {n} + 1`, or `{n} := v => v + 1` (W-1, W-6); .rx has no `=`, `+=` or `++` on state", n = name)));
    }
    if JS_FUNCTION.is_match(line) {
        return Some(("JS_FUNCTION", "`function` is not .rx: a pure function is `fn f(x) => …`, one that writes or awaits is `action f(x) { … }`, one that renders is `component F(props) { … }`".into()));
    }
    if let Some(c) = JS_LOCAL.captures(line) {
        return Some(("JS_LOCAL", format!("`{}` declares a local only in a handler or action body: in a component or at a module's top level, state is `source x := …` and a value computed from others is an equation, `x = …`", &c[1])));
    }
    if JS_RETURN.is_match(line) {
        return Some(("JS_RETURN", "a component has no `return`: its body is declarations, then its markup".into()));
    }
    if let Some(c) = JS_APIS.captures(line) {
        return Some(("JS_API", format!("`{}` is not .rx: state is `source x := …`, a value computed from others is `x = …`, a side effect is `effect (x) {{ … }}`", &c[1])));
    }
    None
}

pub fn parse_program(src: &str) -> R<Program> {
    let mut c = Cursor::new(src);
    let mut decls = vec![];
    c.ws(true);
    while !c.eof() && looks_like_decl(&mut c) {
        decls.extend(parse_decls1(&mut c)?);
        c.ws(true);
        c.eat(";");
        c.ws(true);
    }
    let view = parse_markup(&mut c, Close::Top)?;
    c.ws(true);
    if !c.eof() {
        return c.fail("expected a declaration or markup");
    }
    let dflt: Vec<&Decl> = decls.iter().filter(|d| matches!(d, Decl::Component { is_default: true, .. })).collect();
    if dflt.len() > 1 {
        return c.fail("two default components: a module has one entry");
    }
    if view.is_empty() && !dflt.is_empty() {
        let (name, line) = match dflt[0] {
            Decl::Component { name, line, .. } => (name.clone(), *line),
            _ => unreachable!(),
        };
        let el = Markup { kind: MarkupKind::El { tag: name, attrs: vec![], children: vec![] }, line: Some(line), span: Span::NONE };
        return Ok(Program { decls, view: vec![el], legacy_view: None });
    }
    let legacy = !view.is_empty();
    Ok(Program { decls, view, legacy_view: Some(legacy) })
}

/// CP-8e: an editor's parse. A declaration that does not parse is left out (the error recorded, the parse resumed at the
/// next line that starts at column 0), and a missing member name or expression is an empty one, so the rest of the file
/// still projects. Never used to compile: `parse_program` is the language.
pub fn parse_program_recovering(src: &str) -> (Program, Vec<ParseError>) {
    let mut c = Cursor::new(src);
    c.recover = true;
    let mut decls = vec![];
    c.ws(true);
    while !c.eof() {
        if !looks_like_decl(&mut c) {
            let (at, n) = (c.i, c.errors.len());
            match parse_markup(&mut c, Close::Top) {
                Ok(view) if !view.is_empty() => {
                    let mut errors = c.errors;
                    errors.push(ParseError("line 1: markup at a module's top level (MO-1c)".into(), Some(at), None, "PARSE"));
                    return (Program { decls, view, legacy_view: Some(true) }, errors);
                }
                Ok(_) => break,
                Err(e) => {
                    c.errors.truncate(n);
                    c.errors.push(e);
                    c.i = at;
                    skip_line(&mut c);
                }
            }
        } else {
            let (at, n) = (c.i, c.errors.len());
            match parse_decls1(&mut c) {
                Ok(d) => decls.extend(d),
                Err(e) => {
                    // what the failed attempt noted on the way is moot: the declaration is out
                    c.errors.truncate(n);
                    c.errors.push(e);
                    c.i = at;
                    skip_line(&mut c);
                }
            }
        }
        c.ws(true);
        c.eat(";");
        c.ws(true);
    }
    let (view, legacy_view) = match decls.iter().find(|d| matches!(d, Decl::Component { is_default: true, .. })) {
        Some(Decl::Component { name, line, .. }) => (vec![Markup { kind: MarkupKind::El { tag: name.clone(), attrs: vec![], children: vec![] }, line: Some(*line), span: Span::NONE }], None),
        _ => (vec![], Some(false)),
    };
    (Program { decls, view, legacy_view }, c.errors)
}
/// On to the next line that starts at column 0 with something other than a closing brace (where a declaration may).
fn skip_line(c: &mut Cursor) {
    loop {
        match c.rest().find('\n') {
            None => {
                c.i = c.src.len();
                return;
            }
            Some(j) => c.i += j + 1,
        }
        let ch = c.peek();
        if !ch.is_whitespace() && ch != '}' && ch != '\0' {
            return;
        }
    }
}

/// MO-10b: what a primitive's result is — a reader (`ref T`, an accessor), an io function, a value; or a tuple or record
/// of those (only the result and its parts are declared).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Part {
    Ref,
    Fn,
    Value,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Shape {
    Part(Part),
    Items(Vec<Part>),
    Fields(Vec<(String, Part)>),
    /// MO-11f: the whole result is a component
    Comp,
}
impl Shape {
    pub fn has_ref(&self) -> bool {
        match self {
            Shape::Part(p) => *p == Part::Ref,
            Shape::Items(xs) => xs.contains(&Part::Ref),
            Shape::Fields(fs) => fs.iter().any(|f| f.1 == Part::Ref),
            Shape::Comp => false,
        }
    }
}
pub(crate) fn split_top(s: &str, seps: &str) -> Vec<String> {
    let cs: Vec<char> = s.chars().collect();
    let mut out = vec![];
    let mut depth: i64 = 0;
    let mut from = 0;
    for i in 0..cs.len() {
        let ch = cs[i];
        if "([{<".contains(ch) {
            depth += 1;
        } else if ")]}>".contains(ch) && !(ch == '>' && i > 0 && cs[i - 1] == '=') {
            depth -= 1;
        } else if depth == 0 && seps.contains(ch) {
            out.push(cs[from..i].iter().collect::<String>());
            from = i + 1;
        }
    }
    out.push(cs[from..].iter().collect::<String>());
    out.into_iter().map(|x| js_trim(&x).to_string()).filter(|x| !x.is_empty()).collect()
}
re!(REF_PART, r"^ref\s");
re!(FN_PART, r"\)\s*=>");
re!(REF_WORD, r"\bref\s+");
re!(INSTANTIATES, r"(^|[^A-Za-z0-9_$])instantiates([^A-Za-z0-9_$]|$)");
re!(ROW_WORD, r"^(pending\b|fails\(([^)]*)\))\s*");
re!(ANY_ROW_WORD, r"\b(pending|fails\()");
// MO-10f: a row word written before a type where no record field took it (a tuple's part, a member of a union, a type argument)
re!(STRAY_ROW_WORD, r#"\bpending\s+[A-Za-z_$({\["']|\bfails\([^)]*\)\s*[A-Za-z_$({\["']"#);
re!(OLD_HOLDS, r"(^|[:,\[{]\s*)holds\b");
re!(RENDER_TYPE, r"=>\s*View\s*$");
re!(DRAFT_PARAM, r"^draft\s+[A-Za-z_$]");
re!(TRACKED_WORD, r"\btracked\s+\(");
re!(HANDLER_WORD, r"\bhandler\s+");
re!(DRAFT_WORD, r"\bdraft\s+([A-Za-z_$][\w$]*\s*[?:,)])");
re!(CTX_WORD, r"(^|[^A-Za-z0-9_$])(uses\(|provides\(|nests\(|renders\b|carries\b|under\(|trusted\b|forwards\b|joins\(|methods\()");
fn part_of(t: &str) -> Part {
    if REF_PART.is_match(t) {
        Part::Ref
    } else if t.starts_with('(') && FN_PART.is_match(t) {
        Part::Fn
    } else {
        Part::Value
    }
}
/// A declared field's name: `readonly width?` is `width` (the modifier and the `?` are TypeScript's, not the name's).
fn field_name(k: &str) -> String {
    let k = js_trim(k);
    let k = k.strip_prefix("readonly ").map(js_trim).unwrap_or(k);
    k.strip_suffix('?').unwrap_or(k).to_string()
}
fn shape_of(t: &str) -> Shape {
    // MO-10b: a read-only tuple is a tuple (`as const` results)
    if let Some(rest) = t.strip_prefix("readonly ") {
        if rest.trim_start().starts_with('[') {
            return shape_of(rest.trim_start());
        }
    }
    if t.starts_with('[') && t.ends_with(']') && t.len() >= 2 {
        return Shape::Items(split_top(&t[1..t.len() - 1], ",").iter().map(|x| part_of(x)).collect());
    }
    if t.starts_with('{') && t.ends_with('}') && t.len() >= 2 {
        return Shape::Fields(
            split_top(&t[1..t.len() - 1], ",;")
                .iter()
                .map(|f| {
                    let (k, v) = match f.find(':') {
                        Some(i) => (&f[..i], &f[i + 1..]),
                        None => (&f[..f.len().saturating_sub(1)], &f[..]),
                    };
                    let k = js_trim(k);
                    (field_name(k), part_of(js_trim(v)))
                })
                .collect(),
        );
    }
    if is_component_type(t) {
        return Shape::Comp;
    }
    Shape::Part(part_of(t))
}

/// MO-8: a declaration file (`api.d.rx`) for a JS module.
#[derive(Debug, Clone)]
pub enum JsDecl {
    /// ret: the type text with `ref` taken out (for TY); MO-10: refs (ref parameters), shape (what the result is),
    /// instantiates (written, or inferred from a ref on either side)
    Fn { name: String, pure: bool, params: Vec<String>, rejects: Option<Vec<String>>, line: usize, side: Option<Side>, ptypes: Vec<Option<String>>, ret: Option<String>, refs: Vec<bool>, shape: Shape, instantiates: bool, uses: Vec<String>, provides: Vec<String>, tparams: Option<String>, nests: Option<(String, String)>, held: Vec<(String, bool, Vec<String>)>, cbs: Vec<Option<(bool, Vec<String>)>>, opts: Vec<bool>, renders: bool, carrier: bool, under: Option<(String, String)>, drafts: Vec<(usize, Vec<usize>)>, part_drafts: Vec<(String, Vec<(usize, Vec<usize>)>)>, draft_args: Vec<usize> },
    /// SV-5a: `fields`, what of an instance is sent to the client (`export error HttpError(status, code)`); none, name and message only
    Error { name: String, line: usize, fields: Vec<String> },
    Type { name: String, line: usize, text: String },
    /// MO-11a: a Solid component
    /// `tparams`: MO-8d, a generic component's type parameters (`component Select<Option>(…)`), TypeScript's text
    /// `props_type`: MO-8o, the props are a type the library declares (`props: Kit.SelectProps<Option> & { … }`), and
    /// `props` the fields of the record after `&`, the ones that carry words
    Comp { name: String, line: usize, props: Vec<JsProp>, fails: Vec<String>, content: Option<crate::content::Shape>, uses: Vec<String>, provides: Vec<String>, outlet: bool, tparams: Option<String>, props_type: Option<String> },
    /// MO-12a: a JS context (Solid's createContext), named by uses(…) and provides(…)
    Context { name: String, line: usize },
    /// MO-8g: a value the module exports (`export const pageSearch: Schema`)
    Value { name: String, line: usize, ty: Option<String> },
}
/// MO-11a: a declared JS component's prop — its TypeScript type, what the component discharges for it (`None` in the list:
/// every class), and whether it takes a component value (MO-11c: its type is `Component`).
#[derive(Debug, Clone)]
pub struct JsProp {
    pub name: String,
    pub optional: bool,
    pub ty: Option<String>,
    pub catches: Option<Option<Vec<String>>>,
    pub component: bool,
    /// MO-11k: a function giving a View (a render prop)
    pub render: bool,
    /// MO-10g: any other function (a callback, checked as a handler)
    pub callback: bool,
    /// MO-10g: a function type without `handler`: pure, whatever the prop's name
    pub pure: bool,
    /// MO-11o: it renders the components its value carries (`router: renders any`)
    pub carried: bool,
}
impl JsDecl {
    pub fn name(&self) -> &str {
        match self {
            JsDecl::Fn { name, .. } | JsDecl::Error { name, .. } | JsDecl::Type { name, .. } | JsDecl::Comp { name, .. } | JsDecl::Context { name, .. } | JsDecl::Value { name, .. } => name,
        }
    }
}

/// MO-8j, TY-7: what running must show before a row counts as verified, each a claim the row makes as this parser read
/// it, however it is laid out: `exists` (the export is there, of its kind), `pure`, `uses`, `provides`, `fields` (a result
/// part that is `ref`, `pending` or `fails(…)`), `fails` (a field, or a component, that fails with a class), `callbacks`
/// (a function-typed parameter or record field: handler or pure), `draft`, `placement` (`renders…`, `nests(…)`,
/// `outlet`, a prop that `renders`, a carrier). rx-verify tags each result with the claim it
/// ran; a claim no result answers is not verified.
pub fn obligations(d: &JsDecl) -> Vec<String> {
    let mut out: Vec<String> = vec!["exists".into()];
    let fn_typed = |t: &str| {
        let t = js_trim(t);
        let t = t.strip_prefix("ref").filter(|r| r.starts_with(char::is_whitespace)).map(js_trim).unwrap_or(t);
        let t = ["handler"].iter().find_map(|w| t.strip_prefix(w).filter(|r| r.starts_with(char::is_whitespace)).map(js_trim)).unwrap_or(t);
        fn_params_text(t).is_some()
    };
    match d {
        JsDecl::Fn { params, pure, instantiates, uses, provides, held, shape, ptypes, renders, nests, carrier, under, drafts, part_drafts, .. } => {
            if *pure && !*instantiates {
                out.push("pure".into());
            }
            if !uses.is_empty() {
                out.push("uses".into());
            }
            // RFC 28: each context it provides is a claim of its own: one hook that uses `a` says nothing of `b`
            for c in provides {
                out.push(format!("provides:{c}"));
            }
            if !held.is_empty() || shape.has_ref() {
                out.push("fields".into());
            }
            if held.iter().any(|h| !h.2.is_empty()) {
                out.push("fails".into());
            }
            // RFC 29: each callback position is a claim of its own (`callbacks:onChange`, `callbacks:options.onSuccess`), as
            // rx-verify names what it ran
            for (i, t) in ptypes.iter().enumerate() {
                let Some(t) = t else { continue };
                let t = js_trim(t);
                let t = t.strip_prefix("ref").filter(|r| r.starts_with(char::is_whitespace)).map(js_trim).unwrap_or(t);
                let name = params.get(i).map(|n| n.trim_start_matches("...").to_string()).unwrap_or_else(|| i.to_string());
                if fn_typed(t) {
                    out.push(format!("callbacks:{name}"));
                } else if t.starts_with('{') && t.ends_with('}') {
                    for f in split_top(&t[1..t.len() - 1], ",;") {
                        let Some(at) = f.find(':') else { continue };
                        if fn_typed(&f[at + 1..]) {
                            out.push(format!("callbacks:{name}.{}", js_trim(&f[..at]).trim_end_matches('?').trim()));
                        }
                    }
                }
            }
            if !drafts.is_empty() || !part_drafts.is_empty() {
                out.push("draft".into());
            }
            if *renders || nests.is_some() || *carrier || under.is_some() || matches!(shape, Shape::Comp) {
                out.push("placement".into());
            }
        }
        JsDecl::Comp { props, fails, uses, provides, outlet, .. } => {
            if !uses.is_empty() {
                out.push("uses".into());
            }
            for c in provides {
                out.push(format!("provides:{c}"));
            }
            // RFC 29: a function-typed prop (`ref: handler (el) => void`, `onPick: (id) => void`) is a callback claim, each
            // prop its own: that the export is a function says nothing of how it calls them
            for p in props.iter().filter(|p| p.callback || p.pure) {
                out.push(format!("callbacks:{}", p.name));
            }
            if !fails.is_empty() {
                out.push("fails".into());
            }
            if *outlet || props.iter().any(|p| p.carried) {
                out.push("placement".into());
            }
        }
        JsDecl::Error { .. } | JsDecl::Value { .. } | JsDecl::Type { .. } | JsDecl::Context { .. } => {}
    }
    out
}
/// MO-11: `Component` or `Component<P>`, and nothing that only contains one (`Component[]`).
/// MO-10i: a function type's parameter list (`(a: A, b: B) => R` → `a: A, b: B`), or None.
fn fn_params_text(t: &str) -> Option<String> {
    let t = t.trim();
    if !t.starts_with('(') {
        return None;
    }
    let cs: Vec<char> = t.chars().collect();
    let mut depth = 0i64;
    for i in 0..cs.len() {
        let ch = cs[i];
        if "([{<".contains(ch) {
            depth += 1;
        } else if ")]}".contains(ch) || (ch == '>' && i > 0 && cs[i - 1] != '=') {
            depth -= 1;
            if depth == 0 {
                let rest: String = cs[i + 1..].iter().collect();
                return if rest.trim_start().starts_with("=>") { Some(cs[1..i].iter().collect()) } else { None };
            }
        }
    }
    None
}
/// MO-10i: the positions of a function type's parameters written `draft` (`(draft state: T) => void` → [0]).
fn draft_params(t: Option<&str>) -> Vec<usize> {
    let Some(ps) = t.and_then(fn_params_text) else { return vec![] };
    split_top(&ps, ",").iter().enumerate().filter(|(_, p)| DRAFT_PARAM.is_match(p)).map(|(i, _)| i).collect()
}
/// MO-10i: for a function type, its callback parameters' draft positions.
fn drafts_of_fn(t: &str) -> Vec<(usize, Vec<usize>)> {
    let Some(ps) = fn_params_text(t) else { return vec![] };
    split_top(&ps, ",")
        .iter()
        .enumerate()
        .filter_map(|(i, p)| {
            let ds = match p.find(':') {
                Some(c) => draft_params(Some(p[c + 1..].trim())),
                None => vec![],
            };
            (!ds.is_empty()).then_some((i, ds))
        })
        .collect()
}
/// MO-10i: a result's function parts that take draft callbacks, by tuple index or field name.
fn draft_parts(ret: Option<&str>) -> Vec<(String, Vec<(usize, Vec<usize>)>)> {
    let Some(t) = ret.map(str::trim) else { return vec![] };
    let mut out = vec![];
    if t.starts_with('[') && t.ends_with(']') {
        for (i, x) in split_top(&t[1..t.len() - 1], ",").iter().enumerate() {
            let d = drafts_of_fn(x);
            if !d.is_empty() {
                out.push((i.to_string(), d));
            }
        }
    } else if t.starts_with('{') && t.ends_with('}') {
        for f in split_top(&t[1..t.len() - 1], ",;") {
            if let Some(c) = f.find(':') {
                let d = drafts_of_fn(f[c + 1..].trim());
                if !d.is_empty() {
                    out.push((field_name(&f[..c]), d));
                }
            }
        }
    }
    out
}
/// MO-10g: `handler` not followed by a function type (`(`).
fn handler_misplaced(t: &str) -> bool {
    HANDLER_WORD.find_iter(t).any(|m| !t[m.end()..].starts_with('('))
}
/// MO-10g: the type without the `.d.rx`'s `handler` word.
fn strip_handler(t: &str) -> String {
    let mut out = String::new();
    let mut at = 0;
    for m in HANDLER_WORD.find_iter(t) {
        if t[m.end()..].starts_with('(') {
            out.push_str(&t[at..m.start()]);
            at = m.end();
        }
    }
    out.push_str(&t[at..]);
    out
}
/// MO-10g: a function type marked `handler` (revised 2026-11-21): only such a type is a callback.
fn is_handler(t: &str) -> bool {
    t.strip_prefix("handler").is_some_and(|r| r.starts_with(char::is_whitespace) && js_trim(r).starts_with('('))
}
/// `tracked` was a word before a function type (a callback the library calls inside a computation of its own). A function
/// type without `handler` is a pure function already (MO-10g), which is all the checker read of it: the word is refused,
/// so that a row written with it is not read by the prop's name instead.
fn tracked_word(t: &str) -> bool {
    TRACKED_WORD.is_match(&masked_strings(t))
}
const TRACKED_GONE: &str = "`tracked` is not a word of a declaration: a function type without `handler` is a pure function already, however the library calls it (MO-10g) — leave the word out";
/// Words a declaration had and has no more (09 MO-8i, the pruning of 2026-11-22): each is refused with what says it now,
/// so a row written with one is not read as a type that ends in a name.
const GONE_WORDS: [(&str, &str); 4] = [
    ("forwards", "`forwards` is not a word of a declaration: a `pure` fn that makes nothing hands what it is given back only as its result, so its call among a factory's arguments already hands its components on (MO-11g) — leave the word out"),
    ("joins", "`joins(…)` is not a word of a declaration: how a router joins a nested path with its parents' is that router's rule (08 CN-8c), and its own types say it — leave the word out"),
    ("methods", "`methods(…)` is not a word of a declaration: a method of an instance is a call whose answer may change (02 E-10); where it is made once, the argument says so with `peek` — leave the word out"),
    ("trusted", "`trusted` is not a word of a declaration (MO-8j): a row is taken on the declaration's word unless the project asks for strict declarations, and then it is shown by `rx-verify --record` — leave the word out"),
];
const GONE_ROOT: &str = "`renders(root, …)` is not a word of a declaration: a component given to a fn that says nothing of where it renders it is already checked under a root of its own (MO-11s) — leave the word out";
fn strip_draft(t: &str) -> String {
    DRAFT_WORD.replace_all(t, "$1").to_string()
}
/// 07 §3: a balanced `<…>` at the start of `s` followed by `(`: its text and the byte length up to the `(`.
/// 07 §3: whether `text`, between a call's `<` and `>`, is TypeScript type arguments: a comma-separated list of types
/// that a type grammar consumes completely, as TypeScript decides when it tries them and falls back to comparisons.
/// `a<b && c>(d)`, `a<b + c>(d)` and `a<b[c+1]>(d)` are comparisons; `f<{ a: string }[]>(x)`, `f<A | B>(x)`,
/// `f<(x: T) => U>(x)`, `f<K extends keyof T ? T[K] : never>(x)` are calls.
fn looks_like_types(text: &str) -> bool {
    let Some((toks, nl)) = ty_tokens(text) else { return false };
    let mut p = TyP { t: &toks, nl: &nl, i: 0 };
    if !p.list() {
        return false;
    }
    p.i == toks.len()
}
#[derive(Debug, Clone, PartialEq)]
enum TyTok {
    Word(String),
    /// a literal: `true` for a number (`-1` is a type, `-"1"` is not)
    Lit(bool),
    Punct(&'static str),
}
/// the tokens, and whether a line break comes before each (a member of an object type may end at one)
fn ty_tokens(s: &str) -> Option<(Vec<TyTok>, Vec<bool>)> {
    const PUNCT: [&str; 22] = ["...", "=>", "-?", "+?", "<", ">", "(", ")", "[", "]", "{", "}", ",", ";", ":", "?", "|", "&", ".", "=", "-", "+"];
    let b = s.as_bytes();
    let mut out = vec![];
    let mut nl = vec![];
    let mut brk = false;
    let mut j = 0;
    let word_ch = |c: u8| c.is_ascii_alphanumeric() || c == b'_' || c == b'$' || c >= 0x80;
    while j < b.len() {
        let ch = b[j];
        if ch.is_ascii_whitespace() {
            brk |= ch == b'\n';
            j += 1;
            continue;
        }
        nl.push(brk);
        brk = false;
        if ch == b'"' || ch == b'\'' || ch == b'`' {
            let mut subs = vec![];
            j = quoted_end(b, j, &mut subs)?;
            // a template literal type's substitution is a type: `${c+1}` makes the whole a comparison
            if subs.iter().any(|&(a, z)| !one_type(&s[a..z])) {
                return None;
            }
            out.push(TyTok::Lit(false));
            continue;
        }
        if ch.is_ascii_digit() {
            while j < b.len() && (b[j].is_ascii_alphanumeric() || b[j] == b'.' || b[j] == b'_') {
                j += 1;
            }
            out.push(TyTok::Lit(true));
            continue;
        }
        if word_ch(ch) {
            let k = j;
            while j < b.len() && word_ch(b[j]) {
                j += 1;
            }
            out.push(TyTok::Word(s[k..j].to_string()));
            continue;
        }
        let rest = &s[j..];
        let p = PUNCT.iter().find(|p| rest.starts_with(**p))?;
        // `+`, `-?`, `+?` only as a mapped type's modifiers; elsewhere the grammar refuses them
        out.push(TyTok::Punct(p));
        j += p.len();
    }
    Some((out, nl))
}
/// R4 (RFC 11): the index just past the string or template literal opening at `b[j]`, with the spans of a template's own
/// substitutions in `subs`. A substitution is scanned as code: braces nest, and a string or template inside it is skipped
/// whole, so `${"}"}` does not end it. None when the literal is not closed.
pub(crate) fn quoted_end(b: &[u8], j: usize, subs: &mut Vec<(usize, usize)>) -> Option<usize> {
    let q = b[j];
    let mut j = j + 1;
    while j < b.len() {
        match b[j] {
            b'\\' => j += 2,
            c if c == q => return Some(j + 1),
            b'$' if q == b'`' && b.get(j + 1) == Some(&b'{') => {
                let start = j + 2;
                let mut depth = 1;
                j = start;
                while depth > 0 {
                    match *b.get(j)? {
                        b'{' => {
                            depth += 1;
                            j += 1;
                        }
                        b'}' => {
                            depth -= 1;
                            if depth == 0 {
                                subs.push((start, j));
                            }
                            j += 1;
                        }
                        b'"' | b'\'' | b'`' => j = quoted_end(b, j, &mut vec![])?,
                        _ => j += 1,
                    }
                }
            }
            _ => j += 1,
        }
    }
    None
}
/// one type, consumed whole (a template literal type's substitution)
fn one_type(text: &str) -> bool {
    let Some((toks, nl)) = ty_tokens(text) else { return false };
    let mut p = TyP { t: &toks, nl: &nl, i: 0 };
    p.ty() && p.i == toks.len()
}
struct TyP<'t> {
    t: &'t [TyTok],
    nl: &'t [bool],
    i: usize,
}
const TY_RESERVED: [&str; 14] = ["extends", "keyof", "typeof", "infer", "readonly", "unique", "new", "abstract", "import", "is", "asserts", "in", "as", "this"];
impl<'t> TyP<'t> {
    fn peek(&self) -> Option<&TyTok> {
        self.t.get(self.i)
    }
    fn at(&self, p: &str) -> bool {
        matches!(self.peek(), Some(TyTok::Punct(q)) if *q == p)
    }
    fn at_word(&self, w: &str) -> bool {
        matches!(self.peek(), Some(TyTok::Word(x)) if x == w)
    }
    fn eat(&mut self, p: &str) -> bool {
        if self.at(p) {
            self.i += 1;
            true
        } else {
            false
        }
    }
    fn eat_word(&mut self, w: &str) -> bool {
        if self.at_word(w) {
            self.i += 1;
            true
        } else {
            false
        }
    }
    fn name(&mut self) -> bool {
        if let Some(TyTok::Word(_)) = self.peek() {
            self.i += 1;
            true
        } else {
            false
        }
    }
    fn list(&mut self) -> bool {
        loop {
            if !self.ty() {
                return false;
            }
            if !self.eat(",") {
                return true;
            }
            if self.i == self.t.len() {
                return true; // a trailing comma
            }
        }
    }
    fn ty(&mut self) -> bool {
        if self.fn_type() {
            return true;
        }
        if !self.union() {
            return false;
        }
        if self.eat_word("extends") {
            // a conditional type: `A extends B ? C : D`
            if !self.union() {
                return false;
            }
            return self.eat("?") && self.ty() && self.eat(":") && self.ty();
        }
        true
    }
    /// `(…) => T`, `<T>(…) => T`, `new (…) => T`, `abstract new (…) => T`; a parenthesized type is not one
    fn fn_type(&mut self) -> bool {
        let start = self.i;
        self.eat_word("abstract");
        let ctor = self.eat_word("new");
        if self.at("<") {
            self.i += 1;
            if !self.type_params() {
                self.i = start;
                return false;
            }
        }
        if !self.at("(") {
            self.i = start;
            return false;
        }
        // a parenthesized type unless the matching `)` is followed by `=>`
        let mut depth = 0;
        let mut k = self.i;
        while k < self.t.len() {
            match &self.t[k] {
                TyTok::Punct("(") | TyTok::Punct("[") | TyTok::Punct("{") => depth += 1,
                TyTok::Punct(")") | TyTok::Punct("]") | TyTok::Punct("}") => {
                    depth -= 1;
                    if depth == 0 {
                        break;
                    }
                }
                _ => {}
            }
            k += 1;
        }
        if !matches!(self.t.get(k + 1), Some(TyTok::Punct("=>"))) {
            if ctor {
                return false;
            }
            self.i = start;
            return false;
        }
        self.i += 1;
        if !self.params(")") {
            return false;
        }
        if !self.eat("=>") {
            return false;
        }
        self.ret()
    }
    /// a return type: a type, or a predicate `x is T` / `asserts x [is T]`
    fn ret(&mut self) -> bool {
        let save = self.i;
        if self.eat_word("asserts") && (self.name()) {
            if self.eat_word("is") {
                return self.ty();
            }
            return true;
        }
        self.i = save;
        if self.name() && self.eat_word("is") {
            return self.ty();
        }
        self.i = save;
        self.ty()
    }
    /// `T extends U = V, …>` after the `<`
    fn type_params(&mut self) -> bool {
        loop {
            self.eat_word("const");
            self.eat_word("in");
            self.eat_word("out");
            if !self.name() {
                return false;
            }
            if self.eat_word("extends") && !self.ty() {
                return false;
            }
            if self.eat("=") && !self.ty() {
                return false;
            }
            if self.eat(">") {
                return true;
            }
            if !self.eat(",") {
                return false;
            }
            if self.eat(">") {
                return true;
            }
        }
    }
    /// parameters up to `close`: `...name?: T`, a binding pattern, `this: T`
    fn params(&mut self, close: &str) -> bool {
        loop {
            if self.eat(close) {
                return true;
            }
            self.eat("...");
            if self.at("{") || self.at("[") {
                if !self.skip_balanced() {
                    return false;
                }
            } else if !self.name() {
                return false;
            }
            self.eat("?");
            if self.eat(":") && !self.ty() {
                return false;
            }
            if self.eat("=") {
                return false; // no initializer in a type
            }
            if self.eat(close) {
                return true;
            }
            if !self.eat(",") {
                return false;
            }
        }
    }
    fn skip_balanced(&mut self) -> bool {
        let mut depth = 0;
        while let Some(t) = self.peek() {
            match t {
                TyTok::Punct("(") | TyTok::Punct("[") | TyTok::Punct("{") => depth += 1,
                TyTok::Punct(")") | TyTok::Punct("]") | TyTok::Punct("}") => {
                    depth -= 1;
                    if depth == 0 {
                        self.i += 1;
                        return true;
                    }
                }
                _ => {}
            }
            self.i += 1;
        }
        false
    }
    fn union(&mut self) -> bool {
        self.eat("|");
        loop {
            if !self.intersection() {
                return false;
            }
            if !self.eat("|") {
                return true;
            }
        }
    }
    fn intersection(&mut self) -> bool {
        self.eat("&");
        loop {
            if !self.operator() {
                return false;
            }
            if !self.eat("&") {
                return true;
            }
        }
    }
    fn operator(&mut self) -> bool {
        if self.eat_word("keyof") || self.eat_word("unique") || self.eat_word("readonly") {
            return self.operator();
        }
        if self.eat_word("infer") {
            if !self.name() {
                return false;
            }
            let save = self.i;
            // `infer U extends T` — the constraint, unless it begins a conditional type's `extends`
            if self.eat_word("extends") {
                if !(self.operator() && !self.at("?")) {
                    self.i = save;
                }
            }
            return true;
        }
        self.postfix()
    }
    fn postfix(&mut self) -> bool {
        if !self.primary() {
            return false;
        }
        while self.at("[") {
            self.i += 1;
            if self.eat("]") {
                continue;
            }
            if !(self.ty() && self.eat("]")) {
                return false;
            }
        }
        true
    }
    fn args(&mut self) -> bool {
        // after a name: `<T, U>`
        if !self.eat("<") {
            return true;
        }
        loop {
            if !self.ty() {
                return false;
            }
            if self.eat(">") {
                return true;
            }
            if !self.eat(",") {
                return false;
            }
        }
    }
    fn primary(&mut self) -> bool {
        match self.peek().cloned() {
            Some(TyTok::Lit(_)) => {
                self.i += 1;
                true
            }
            Some(TyTok::Punct("-")) => {
                self.i += 1;
                if matches!(self.peek(), Some(TyTok::Lit(true))) {
                    self.i += 1;
                    true
                } else {
                    false
                }
            }
            Some(TyTok::Punct("(")) => {
                self.i += 1;
                self.ty() && self.eat(")")
            }
            Some(TyTok::Punct("[")) => {
                self.i += 1;
                self.tuple()
            }
            Some(TyTok::Punct("{")) => {
                self.i += 1;
                self.object()
            }
            Some(TyTok::Word(w)) if w == "typeof" => {
                self.i += 1;
                if !self.eat_word("import") && !self.name() {
                    return false;
                }
                while self.eat(".") {
                    if !self.name() {
                        return false;
                    }
                }
                self.args()
            }
            Some(TyTok::Word(w)) if w == "import" => {
                self.i += 1;
                if !(self.eat("(") && matches!(self.peek(), Some(TyTok::Lit(false)))) {
                    return false;
                }
                self.i += 1;
                if !self.eat(")") {
                    return false;
                }
                while self.eat(".") {
                    if !self.name() {
                        return false;
                    }
                }
                self.args()
            }
            Some(TyTok::Word(w)) if !TY_RESERVED.contains(&w.as_str()) || w == "this" => {
                self.i += 1;
                while self.eat(".") {
                    if !self.name() {
                        return false;
                    }
                }
                self.args()
            }
            _ => false,
        }
    }
    fn tuple(&mut self) -> bool {
        loop {
            if self.eat("]") {
                return true;
            }
            self.eat("...");
            // a labelled element, `name?: T`
            let save = self.i;
            if self.name() {
                self.eat("?");
                if !self.eat(":") {
                    self.i = save;
                }
            }
            if !self.ty() {
                return false;
            }
            self.eat("?");
            if self.eat("]") {
                return true;
            }
            if !self.eat(",") {
                return false;
            }
        }
    }
    fn prop_name(&mut self) -> bool {
        match self.peek() {
            Some(TyTok::Word(_)) | Some(TyTok::Lit(_)) => {
                self.i += 1;
                true
            }
            _ => false,
        }
    }
    fn object(&mut self) -> bool {
        loop {
            if self.eat("}") {
                return true;
            }
            if !self.member() {
                return false;
            }
            if self.eat("}") {
                return true;
            }
            if !(self.eat(",") || self.eat(";") || self.nl.get(self.i) == Some(&true)) {
                return false;
            }
        }
    }
    fn member(&mut self) -> bool {
        // a call or construct signature: `(…): T`, `<T>(…): T`, `new (…): T`
        let save = self.i;
        let ctor = self.at_word("new") && matches!(self.t.get(self.i + 1), Some(TyTok::Punct("(")) | Some(TyTok::Punct("<")));
        if ctor {
            self.i += 1;
        }
        if self.at("(") || self.at("<") {
            if self.eat("<") && !self.type_params() {
                return false;
            }
            return self.eat("(") && self.params(")") && (!self.eat(":") || self.ret());
        }
        self.i = save;
        // modifiers: `readonly`, `+readonly`, `-readonly`, `get`/`set` accessors
        if (self.at("-") || self.at("+")) && matches!(self.t.get(self.i + 1), Some(TyTok::Word(w)) if w == "readonly") {
            self.i += 1;
        }
        if self.at_word("readonly") && !matches!(self.t.get(self.i + 1), Some(TyTok::Punct(":")) | Some(TyTok::Punct("?")) | Some(TyTok::Punct("(")) | Some(TyTok::Punct(",")) | Some(TyTok::Punct(";")) | Some(TyTok::Punct("}"))) {
            self.i += 1;
        }
        if (self.at_word("get") || self.at_word("set")) && matches!(self.t.get(self.i + 1), Some(TyTok::Word(_)) | Some(TyTok::Lit(_)) | Some(TyTok::Punct("["))) {
            self.i += 1;
        }
        if self.eat("[") {
            // an index signature `[k: string]: T`, a mapped type `[K in T as U]-?: V`, or a computed name `[Symbol.iterator]`
            let save = self.i;
            if self.name() && self.eat(":") {
                if !(self.ty() && self.eat("]")) {
                    return false;
                }
            } else {
                self.i = save;
                if self.name() && self.eat_word("in") {
                    if !self.ty() {
                        return false;
                    }
                    if self.eat_word("as") && !self.ty() {
                        return false;
                    }
                    if !self.eat("]") {
                        return false;
                    }
                } else {
                    self.i = save;
                    if !self.name() {
                        return false;
                    }
                    while self.eat(".") {
                        if !self.name() {
                            return false;
                        }
                    }
                    if !self.eat("]") {
                        return false;
                    }
                }
            }
        } else if !self.prop_name() {
            return false;
        }
        let _ = self.eat("?") || self.eat("-?") || self.eat("+?");
        if self.at("(") || self.at("<") {
            // a method
            if self.eat("<") && !self.type_params() {
                return false;
            }
            return self.eat("(") && self.params(")") && (!self.eat(":") || self.ret());
        }
        if self.eat(":") {
            return self.ty();
        }
        // a member with no type is `any` in a declaration but not in an object type literal
        false
    }
}
fn type_args_at(s: &str) -> Option<(String, usize)> {
    let b = s.as_bytes();
    if b.first() != Some(&b'<') {
        return None;
    }
    let mut depth = 0i64;
    let mut j = 0;
    while j < b.len() {
        let ch = b[j];
        if ch == b'"' || ch == b'\'' || ch == b'`' {
            // R4: a string type argument is skipped whole (`f<"}">(x)`)
            j = quoted_end(b, j, &mut vec![])?;
            continue;
        }
        if b"<([{".contains(&ch) {
            depth += 1;
        } else if b")]}".contains(&ch) || (ch == b'>' && (j == 0 || b[j - 1] != b'=')) {
            depth -= 1;
            if depth == 0 {
                let text = s[1..j].trim();
                return if ch == b'>' && b.get(j + 1) == Some(&b'(') && looks_like_types(text) { Some((text.to_string(), j + 1)) } else { None };
            }
        }
        j += 1;
    }
    None
}
fn is_component_type(t: &str) -> bool {
    // MO-11c: `string | Component` (a polymorphic `as`), `Component | undefined`
    let alts = split_top(t, "|");
    if alts.len() > 1 {
        return alts.iter().any(|a| is_component_type(a));
    }
    // MO-11m: `Component & { paths: … }`, a component with properties
    let parts = split_top(t, "&");
    if parts.len() > 1 {
        return is_component_type(&parts[0]);
    }
    match t.strip_prefix("Component") {
        Some(r) => {
            let r = r.trim_start();
            if r.is_empty() {
                return true;
            }
            if !r.starts_with('<') {
                return false;
            }
            // the `>` that closes the first `<` ends the type
            let b = r.as_bytes();
            let mut depth = 0;
            for i in 0..b.len() {
                if b[i] == b'<' {
                    depth += 1;
                } else if b[i] == b'>' && (i == 0 || b[i - 1] != b'=') {
                    depth -= 1;
                    if depth == 0 {
                        return i == b.len() - 1;
                    }
                }
            }
            false
        }
        None => false,
    }
}
/// MO-11a: `component A(props: { href: string; children?: View }) fails(…) shape(…)`.
fn parse_js_component(c: &mut Cursor, line: usize) -> R<JsDecl> {
    c.ws(true);
    let mut name = c.ident_or("component name")?;
    while c.peek() == '.' {
        // MO-11q: a member component, `component Dialog.Root(…)`
        c.i += 1;
        name.push('.');
        name.push_str(&c.ident_or("a member component's name: `component Dialog.Root(…)`")?);
    }
    c.ws(true);
    let tparams = type_params(c); // MO-8d: `component Select<Option, G = never>(…)`, TypeScript's, for TY
    c.ws(true);
    c.expect("(")?;
    c.ws(true);
    let mut props = vec![];
    let mut props_type = None;
    if !c.starts_with(")") {
        if c.ident().as_deref() != Some("props") {
            return c.fail("a component's props: `(props: { … })`");
        }
        c.ws(true);
        c.expect(":")?;
        c.ws(true);
        // MO-8o: `props: import("kit").SelectProps<Option> & { onChange?: handler (v: Option) => void }`
        if !c.starts_with("{") || !closes_props(c.src.as_bytes(), c.i) {
            props_type = Some(props_type_of(c)?);
        }
        let record = c.eat("{");
        loop {
            if !record {
                break;
            }
            c.ws(true);
            if c.eat("}") {
                break;
            }
            // MO-10b: TypeScript's `readonly` is a modifier of the field, not its name (`readonly id?: string`); a prop
            // may be named `readonly` (an input's)
            let at = c.i;
            if c.keyword("readonly") {
                c.ws(false);
                if c.starts_with("?") || c.starts_with(":") {
                    c.i = at;
                }
            }
            let fname = c.ident_or("a prop name")?;
            c.ws(false);
            let optional = c.eat("?");
            c.ws(false);
            let (mut ty, mut catches) = (None, None);
            if c.eat(":") {
                c.ws(false);
                if c.keyword("catches") {
                    c.ws(false);
                    c.expect("(")?;
                    c.ws(true);
                    catches = Some(if c.eat("*") { None } else { parse_classes(c)? });
                    c.ws(true);
                    c.expect(")")?;
                    c.ws(false);
                }
                let t0 = c.i;
                let mut depth = 0i32;
                while !c.eof() {
                    let ch = c.peek();
                    if depth == 0 && (matches!(ch, ';' | ',' | '}' | '\n') || c.starts_with("//")) {
                        break;
                    }
                    // a string literal type
                    if ch == '"' || ch == '\'' || ch == '`' {
                        c.bump();
                        while !c.eof() && c.peek() != ch {
                            if c.peek() == '\\' {
                                c.bump();
                            }
                            c.bump();
                        }
                        c.bump();
                        continue;
                    }
                    if "([{<".contains(ch) {
                        depth += 1;
                    } else if ")]}".contains(ch) || (ch == '>' && c.i > 0 && c.src.as_bytes()[c.i - 1] != b'=') {
                        depth -= 1;
                    }
                    c.bump();
                }
                let t = js_trim(&c.src[t0..c.i]);
                ty = (!t.is_empty()).then(|| t.to_string());
            }
            // MO-11o: `router: renders any`
            let mut carried = false;
            if let Some(t) = ty.clone() {
                if let Some(rest) = t.strip_prefix("renders ") {
                    carried = true;
                    let rest = js_trim(rest);
                    ty = (!rest.is_empty()).then(|| rest.to_string());
                }
            }
            if ty.as_deref().is_some_and(tracked_word) {
                return c.fail(TRACKED_GONE);
            }
            // MO-10g: `valueChange: handler (v: number) => void` — called later, outside any computation: a handler
            let mut handler = false;
            if let Some(t) = ty.clone() {
                if let Some(rest) = t.strip_prefix("handler ") {
                    handler = true;
                    let rest = js_trim(rest);
                    if part_of(rest) != Part::Fn {
                        return c.fail(&format!("`handler` on prop {}: it goes before a function type, one the library calls later, outside any computation (MO-10g)", fname));
                    }
                    ty = Some(rest.to_string());
                }
            }
            let component = ty.as_deref().is_some_and(is_component_type);
            let render = ty.as_deref().is_some_and(|t| RENDER_TYPE.is_match(t));
            let callback = handler && !render && !component && ty.as_deref().is_some_and(|t| part_of(t) == Part::Fn);
            let pure = !callback && !render && !component && ty.as_deref().is_some_and(|t| part_of(t) == Part::Fn);
            props.push(JsProp { name: fname, optional, ty, catches, component, render, callback, pure, carried });
            // a newline separates fields too, as in TypeScript
            c.ws(false);
            if !c.eat(";") && !c.eat(",") && c.peek() != '\n' {
                c.ws(true);
                c.expect("}")?;
                break;
            }
        }
        c.ws(true);
    }
    c.expect(")")?;
    let mut fails = vec![];
    let mut content = None;
    let (mut uses, mut provides) = (vec![], vec![]);
    let mut outlet = false;
    loop {
        c.ws(false);
        if c.keyword("outlet") {
            // MO-11p: it renders, where it is written, what nests under its component
            outlet = true;
            continue;
        }
        for (w, why) in GONE_WORDS {
            if c.keyword(w) {
                return c.fail(why);
            }
        }
        if c.keyword("uses") {
            // MO-12b
            c.ws(false);
            uses.extend(context_names(c)?);
            continue;
        }
        if c.keyword("provides") {
            // MO-12c
            c.ws(false);
            provides.extend(context_names(c)?);
            continue;
        }
        if c.keyword("fails") {
            c.ws(false);
            c.expect("(")?;
            fails = parse_classes(c)?.unwrap_or_else(|| vec!["Error".to_string()]);
            c.ws(true);
            c.expect(")")?;
            continue;
        }
        if c.keyword("shape") {
            c.ws(false);
            c.expect("(")?;
            let t0 = c.i;
            while !c.eof() && c.peek() != ')' {
                c.bump();
            }
            let t = c.src[t0..c.i].to_string();
            c.expect(")")?;
            match crate::signature::content_shape_of(Some(&t)) {
                Ok(sh) => content = Some(sh),
                Err(e) => return c.fail(&e),
            }
            continue;
        }
        break;
    }
    Ok(JsDecl::Comp { name, line, props, fails, content, uses, provides, outlet, tparams, props_type })
}
/// MO-8o: a component's props as a type the library declares, `props: Kit.SelectProps<Option>`, with the fields that carry
/// words in a record after it, `… & { onChange?: handler (v: Option) => void }`: the type's text, TypeScript's (the checker
/// reads none of it), up to the `&` before a record that closes the props, or to the `)` that does. The cursor is left on
/// that record's `{`, or on the `)`.
fn skip_string_at(b: &[u8], mut j: usize) -> usize {
    let q = b[j];
    j += 1;
    while j < b.len() && b[j] != q {
        if b[j] == b'\\' {
            j += 1;
        }
        j += 1;
    }
    j + 1
}
/// Whether the record that opens at `j` closes a component's props: its `}` is followed by the `)` of the parameter.
fn closes_props(b: &[u8], j: usize) -> bool {
    let (mut k, mut braces) = (j, 0i32);
    while k < b.len() {
        let x = b[k];
        if x == b'"' || x == b'\'' || x == b'`' {
            k = skip_string_at(b, k);
            continue;
        }
        if x == b'{' {
            braces += 1;
        } else if x == b'}' {
            braces -= 1;
            if braces == 0 {
                break;
            }
        }
        k += 1;
    }
    let mut e = k + 1;
    while e < b.len() && b[e].is_ascii_whitespace() {
        e += 1;
    }
    e < b.len() && b[e] == b')'
}
fn props_type_of(c: &mut Cursor) -> R<String> {
    let t0 = c.i;
    let b = c.src.as_bytes();
    let mut depth = 0i32;
    while !c.eof() {
        let ch = c.peek();
        if ch == '"' || ch == '\'' || ch == '`' {
            c.i = skip_string_at(b, c.i).min(c.src.len());
            continue;
        }
        let mut end = None;
        if depth == 0 && ch == ')' {
            end = Some((c.i, c.i));
        } else if depth == 0 && ch == '&' {
            let mut j = c.i + 1;
            while j < b.len() && b[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < b.len() && b[j] == b'{' && closes_props(b, j) {
                end = Some((c.i, j));
            }
        }
        if let Some((end, to)) = end {
            let t = js_trim(&c.src[t0..end]).to_string();
            if t.is_empty() {
                return c.fail("a component's props: `(props: { … })`, or a type and the fields that carry words, `(props: Kit.Props & { … })`");
            }
            c.i = to;
            return Ok(t);
        }
        if "([{<".contains(ch) {
            depth += 1;
        } else if ")]}".contains(ch) || (ch == '>' && c.i > 0 && b[c.i - 1] != b'=') {
            depth -= 1;
        }
        c.bump();
    }
    c.fail("a component's props: the `)` that closes them")
}
/// MO-12: `(router, theme)` — contexts the same declaration file declares.
fn context_names(c: &mut Cursor) -> R<Vec<String>> {
    c.expect("(")?;
    let mut out = vec![];
    loop {
        c.ws(true);
        if c.eat(")") {
            return Ok(out);
        }
        out.push(c.ident_or("a context name")?);
        c.ws(true);
        if !c.eat(",") {
            c.ws(true);
            c.expect(")")?;
            return Ok(out);
        }
    }
}
pub fn parse_declarations(src: &str) -> R<Vec<JsDecl>> {
    parse_declaration_rows(src).map(|r| r.0)
}
/// MO-8j: a declaration file's rows as the parser reads them — each declaration and the line its row starts on — for
/// strict declarations (TY-7), which hash rows by the parser, not by a text search.
pub fn parse_declaration_rows(src: &str) -> R<(Vec<JsDecl>, Vec<usize>)> {
    let mut c = Cursor::new(src);
    let mut out = vec![];
    let mut starts = vec![];
    loop {
        c.ws(true);
        if c.eof() {
            return Ok((out, starts));
        }
        let line = c.line();
        starts.push(line);
        if !c.keyword("export") {
            return c.fail("a declaration file declares exports: `export pure fn …`, `export fn …`, `export component …`, `export error …`, `export type …`");
        }
        c.ws(true);
        if c.starts_with("type") || c.starts_with("interface") {
            let t0 = c.i;
            let _ = c.keyword("type") || c.keyword("interface");
            c.ws(true);
            let name = c.ident_or("type name")?;
            c.ws(true);
            type_params(&mut c);
            c.ws(true);
            if c.eat("=") {
                c.ws(true);
                parse_type(&mut c, false, true)?;
            } else if c.starts_with("{") {
                let mut depth = 0;
                loop {
                    if c.peek() == '{' {
                        depth += 1;
                    }
                    if c.peek() == '}' {
                        depth -= 1;
                    }
                    c.bump();
                    if c.eof() || depth == 0 {
                        break;
                    }
                }
            }
            out.push(JsDecl::Type { name, line, text: c.src[t0..c.i].to_string() });
            continue;
        }
        if c.keyword("error") {
            c.ws(true);
            let name = c.ident_or("error class name")?;
            c.ws(false);
            let mut fields = vec![];
            if c.eat("(") {
                let t0 = c.i;
                let mut depth = 1;
                while !c.eof() && depth > 0 {
                    let ch = c.peek();
                    if "([{<".contains(ch) {
                        depth += 1;
                    } else if ")]}>".contains(ch) {
                        depth -= 1;
                    }
                    c.i += ch.len_utf8();
                }
                // SV-5a: an optional field keeps its `?` (`code?`): an instance may come without it
                fields = split_top(&c.src[t0..c.i - 1], ",").iter().map(|f| f.split(':').next().unwrap_or("").chars().filter(|ch| !ch.is_whitespace()).collect::<String>()).filter(|f| !f.is_empty() && f != "?").collect();
            }
            out.push(JsDecl::Error { name, line, fields });
            continue;
        }
        if c.keyword("const") {
            // MO-8g
            c.ws(true);
            let name = c.ident_or("const name")?;
            c.ws(false);
            let ty = if c.eat(":") {
                c.ws(true);
                Some(parse_type(&mut c, false, true)?)
            } else {
                None
            };
            out.push(JsDecl::Value { name, line, ty });
            continue;
        }
        if c.keyword("context") {
            // MO-12a
            c.ws(true);
            let name = c.ident_or("context name")?;
            out.push(JsDecl::Context { name, line });
            continue;
        }
        if c.keyword("component") {
            out.push(parse_js_component(&mut c, line)?);
            continue;
        }
        let side = if c.keyword("server") {
            Some(Side::Server)
        } else if c.keyword("client") {
            Some(Side::Client)
        } else {
            None
        };
        c.ws(true);
        let pure = c.keyword("pure");
        c.ws(true);
        if !c.keyword("fn") {
            return c.fail("fn");
        }
        c.ws(true);
        let name = c.ident_or("fn name")?;
        c.ws(true);
        let tparams = type_params(&mut c); // MO-8d: `fn f<const S extends string>(…)`, TypeScript's, for TY
        c.ws(true);
        c.expect("(")?;
        c.ws(true);
        let mut params = vec![];
        let mut ptypes = vec![];
        let mut refs = vec![];
        let mut opts = vec![];
        let mut draft_args: Vec<usize> = vec![];
        while !c.starts_with(")") {
            let r = c.keyword("ref"); // MO-10a: a ref parameter takes an accessor
            if r {
                c.ws(true);
            }
            refs.push(r);
            // MO-10i (2026-11-22): `draft list: T[]` — a parameter the fn changes in place, now, and does not keep: a draft
            // is given to it as it is (a parameter named draft stays a name)
            if !r {
                let sd = c.i;
                if c.keyword("draft") {
                    c.ws(true);
                    if c.peek().is_ascii_alphabetic() || c.peek() == '_' || c.peek() == '$' {
                        draft_args.push(refs.len() - 1);
                    } else {
                        c.i = sd;
                    }
                }
            }
            let rest = !r && c.eat("..."); // MO-8h: a rest parameter, `...items: T[]`
            let n = c.ident_or("param")?;
            params.push(if rest { format!("...{}", n) } else { n });
            c.ws(false);
            opts.push(c.eat("?")); // MO-8e: a caller may leave it out
            c.ws(false);
            ptypes.push(if c.peek() == ':' {
                c.bump();
                c.ws(true);
                Some(parse_type(&mut c, false, true)?)
            } else {
                None
            });
            c.ws(true);
            if !c.eat(",") {
                break;
            }
            c.ws(true);
        }
        c.expect(")")?;
        if pure && !draft_args.is_empty() {
            return c.fail(&format!("{}: a fn that changes what it is given (`draft {}`) is not `pure` (MO-10i)", name, params[draft_args[0]]));
        }
        let save = c.i;
        c.ws(false);
        let mut ret = None;
        let mut shape = None;
        let mut held = vec![];
        if c.peek() == ':' {
            c.bump();
            c.ws(true);
            let line0 = c.rest().split('\n').next().unwrap_or("").to_string();
            let t = code_of(&line0).to_string(); // words in a `// comment` are not rows
            let m = masked(&t); // nor words in a string literal or inside brackets (`: "renders"`, `: { renders: boolean }`)
            let r1 = REJECTS.find(&m).map(|x| x.end() - "rejects(".len());
            let r2 = INSTANTIATES.find(&m).map(|x| x.start() + if m[x.start()..].starts_with("instantiates") { 0 } else { 1 });
            let r3 = CTX_WORD.find(&m).map(|x| x.start() + if ["uses(", "provides(", "nests(", "renders", "carries", "under(", "trusted", "forwards", "joins(", "methods("].iter().any(|w| m[x.start()..].starts_with(w)) { 0 } else { 1 }); // MO-12
            let r = [r1, r2, r3].into_iter().flatten().min();
            let head = match r {
                Some(at) => &t[..at],
                None => &t[..],
            };
            if OLD_HOLDS.is_match(head) {
                return c.fail("`holds` on a field is now `pending`, the row `.rx` reads it with (MO-8i)");
            }
            let head = js_trim(head).to_string();
            let (head, h) = field_rows(&head); // MO-10f
            held = h;
            if STRAY_ROW_WORD.is_match(&masked_strings(&head)) {
                return c.fail("`pending` and `fails(…)` are written on a field of a result that is a record, `{ data: pending fails(Error) T }` (MO-10f): the read of that field is what holds or fails. A tuple's part that holds is an accessor, `ref T`; a result that may be absent, or one inside another type, has no field the checker could follow");
            }
            if !head.is_empty() {
                shape = Some(shape_of(&head)); // MO-10b: `ref T` is an accessor, read as T
            }
            let stripped = REF_WORD.replace_all(&head, "").to_string();
            ret = if stripped.is_empty() { None } else { Some(stripped) };
            c.i += r.unwrap_or(line0.len());
        } else {
            c.i = save;
        }
        c.ws(false);
        let mut rejects = None;
        if c.keyword("rejects") {
            c.ws(true);
            c.expect("(")?;
            rejects = Some(parse_classes(&mut c)?.unwrap_or_else(|| vec!["Error".to_string()]));
            c.ws(true);
            c.expect(")")?;
        }
        let (mut written, mut uses, mut provides, mut nests, mut renders) = (false, vec![], vec![], None, false);
        let mut carrier = false;
        let mut under: Option<(String, String)> = None;
        loop {
            // MO-12b: `instantiates`, `uses(…)`, `provides(…)`, in any order
            c.ws(false);
            if c.keyword("instantiates") {
                written = true;
                continue;
            }
            for (w, why) in GONE_WORDS {
                if c.keyword(w) {
                    return c.fail(why);
                }
            }
            // MO-11r: one placement vocabulary — `renders` (here), `renders(later)`; `nests(…)` for the tree
            if c.keyword("carries") {
                return c.fail("`carries` is now `renders(later)`: the components travel in the result and a JS component's prop declared `renders` renders them (MO-11r)");
            }
            if c.keyword("under") {
                return c.fail("`under(parent in component)` is now `nests(component under parent)`, beside `renders(later)` (MO-11r)");
            }
            if c.keyword("renders") {
                c.ws(false);
                if c.peek() != '(' {
                    // MO-11l: here, where its result is bound
                    renders = true;
                    continue;
                }
                c.i += 1;
                c.ws(true);
                if c.keyword("later") {
                    // MO-11o: the components travel in its result
                    c.ws(true);
                    c.expect(")")?;
                    carrier = true;
                    continue;
                }
                if c.keyword("root") {
                    return c.fail(GONE_ROOT);
                }
                return c.fail("renders or renders(later): where the library renders the components it is given (MO-11r)");
            }
            if c.keyword("uses") {
                c.ws(false);
                uses.extend(context_names(&mut c)?);
                continue;
            }
            if c.keyword("provides") {
                c.ws(false);
                provides.extend(context_names(&mut c)?);
                continue;
            }
            if c.keyword("nests") {
                c.ws(false);
                c.expect("(")?;
                c.ws(true);
                let first = c.ident_or("nests(children in component) or nests(component under parent): a field of the record (MO-11r)")?;
                c.ws(true);
                if c.keyword("in") {
                    // MO-11i: a children field
                    c.ws(true);
                    let inside = c.ident_or("nests(children in component): the field that holds the component")?;
                    c.ws(true);
                    c.expect(")")?;
                    nests = Some((first, inside));
                    continue;
                }
                if c.keyword("under") {
                    // MO-11p: a parent link
                    c.ws(true);
                    let parent = c.ident_or("nests(component under parent): the field that names the parent value")?;
                    c.ws(true);
                    c.expect(")")?;
                    under = Some((parent, first));
                    continue;
                }
                return c.fail("nests(children in component) or nests(component under parent) (MO-11r)");
            }
            break;
        }
        // MO-10i (2026-11-22): a result with a function part that hands out drafts is state the call made: a primitive
        let makes_drafts = !draft_parts(ret.as_deref()).is_empty();
        let instantiates = written || refs.iter().any(|x| *x) || carrier || shape.as_ref().is_some_and(|s| s.has_ref() || *s == Shape::Comp) || !uses.is_empty() || !held.is_empty() || renders || makes_drafts; // MO-10a; MO-11f: a component handed back; MO-12b: a context read needs the caller's owner
        if nests.is_some() && shape != Some(Shape::Comp) {
            return c.fail(&format!("nests(…) on fn {}: only a fn that hands back a Component renders what it is given (MO-11i)", name));
        }
        if let (Some((parent, inside)), false) = (&under, carrier) {
            return c.fail(&format!("nests({} under {}) on fn {}: it places what the result carries, which is rendered later — add renders(later) (MO-11r)", inside, parent, name));
        }
        if !provides.is_empty() && shape != Some(Shape::Comp) {
            return c.fail(&format!("provides(…) on fn {}: only a fn that hands back a Component provides a context, to what it renders (MO-12c)", name));
        }
        let shape = shape.unwrap_or(Shape::Part(Part::Value));
        for t in ptypes.iter().flatten().chain(ret.iter()) {
            if tracked_word(t) {
                return c.fail(TRACKED_GONE);
            }
        }
        for t in ptypes.iter().flatten().chain(ret.iter()) {
            if handler_misplaced(t) {
                return c.fail(&format!("`handler` on fn {}: it goes before a function type, one the library calls later, outside any computation (MO-10g)", name));
            }
        }
        let cbs = callbacks(&ptypes);
        // MO-10i: callbacks whose parameters are a library's drafts, by position; the word is the .d.rx's, not TypeScript's
        let drafts: Vec<(usize, Vec<usize>)> = ptypes.iter().enumerate().filter_map(|(i, t)| { let ds = draft_params(t.as_deref()); (!ds.is_empty()).then_some((i, ds)) }).collect();
        let part_drafts = draft_parts(ret.as_deref());
        let ptypes: Vec<Option<String>> = ptypes.into_iter().map(|t| t.map(|t| strip_handler(&strip_draft(&t)))).collect();
        let ret = ret.map(|t| strip_handler(&strip_draft(&t)));
        let row = JsDecl::Fn { name, pure, params, rejects, line, side, ptypes, ret, refs, shape, instantiates, uses, provides, tparams, nests, held, cbs, opts, renders, carrier, under, drafts, part_drafts, draft_args };
        // one row an export: a fn with several signatures (TypeScript's overloads) is declared by one of them, and the
        // library's own types say the rest (13 TY-4b)
        if out.iter().any(|d| matches!(d, JsDecl::Fn { .. }) && d.name() == row.name()) {
            return c.fail(&format!("fn {} is declared again: an export has one row. A fn with several signatures is declared by one of them (its words are the fn's), and TypeScript reads the others from the library's own types (MO-8b)", row.name()));
        }
        out.push(row);
    }
}
/// A declaration line without its `// comment` (not a `//` inside a string literal type).
/// `t` with every byte inside a string literal, or inside brackets (`()`, `[]`, `{}`, `<>`), replaced by `_`: the same
/// byte offsets, with only the row's top level left to search for row words.
fn masked(t: &str) -> String {
    let b = t.as_bytes();
    let mut out = b.to_vec();
    let (mut q, mut depth) = (0u8, 0i32);
    let mut i = 0;
    while i < b.len() {
        let ch = b[i];
        if q != 0 {
            out[i] = b'_';
            if ch == b'\\' && i + 1 < b.len() {
                out[i + 1] = b'_';
                i += 1;
            } else if ch == q {
                q = 0;
            }
        } else if ch == b'"' || ch == b'\'' || ch == b'`' {
            q = ch;
            out[i] = b'_';
        } else if matches!(ch, b'(' | b'[' | b'{' | b'<') {
            if depth > 0 {
                out[i] = b'_';
            }
            depth += 1;
        } else if matches!(ch, b')' | b']' | b'}') || (ch == b'>' && (i == 0 || b[i - 1] != b'=')) {
            depth = (depth - 1).max(0);
            if depth > 0 {
                out[i] = b'_';
            }
        } else if depth > 0 {
            out[i] = b'_';
        }
        i += 1;
    }
    String::from_utf8(out).unwrap_or_else(|_| t.to_string())
}

/// A type text with what its string literals hold blanked, so a word inside one is not read as a row.
fn masked_strings(t: &str) -> String {
    let b = t.as_bytes();
    let mut out = b.to_vec();
    let mut q = 0u8;
    let mut i = 0;
    while i < b.len() {
        let ch = b[i];
        if q != 0 {
            out[i] = b'_';
            if ch == b'\\' && i + 1 < b.len() {
                out[i + 1] = b'_';
                i += 1;
            } else if ch == q {
                q = 0;
            }
        } else if ch == b'"' || ch == b'\'' || ch == b'`' {
            q = ch;
            out[i] = b'_';
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
fn code_of(line: &str) -> &str {
    let b = line.as_bytes();
    let mut q = 0u8;
    let mut i = 0;
    while i < b.len() {
        let ch = b[i];
        if q != 0 {
            if ch == b'\\' {
                i += 1;
            } else if ch == q {
                q = 0;
            }
        } else if ch == b'"' || ch == b'\'' || ch == b'`' {
            q = ch;
        } else if ch == b'/' && b.get(i + 1) == Some(&b'/') {
            return &line[..i];
        }
        i += 1;
    }
    line
}
/// MO-10g: where a declared fn takes callbacks, by parameter: the whole parameter (`(true, [])`), or the fields of a record
/// parameter whose types are functions (`(false, ["onSuccess"])`); `None` where it takes none. Empty when it takes none at all.
fn callbacks(ptypes: &[Option<String>]) -> Vec<Option<(bool, Vec<String>)>> {
    let out: Vec<Option<(bool, Vec<String>)>> = ptypes
        .iter()
        .map(|t| {
            let t = t.as_deref()?;
            if is_handler(t) {
                return Some((true, vec![]));
            }
            if t.starts_with('{') && t.ends_with('}') && t.len() >= 2 {
                let fs: Vec<String> = split_top(&t[1..t.len() - 1], ",;")
                    .iter()
                    .filter_map(|f| {
                        let i = f.find(':')?;
                        is_handler(js_trim(&f[i + 1..])).then(|| {
                            let k = js_trim(&f[..i]);
                            field_name(k)
                        })
                    })
                    .collect();
                return if fs.is_empty() { None } else { Some((false, fs)) };
            }
            None
        })
        .collect();
    if out.iter().any(|x| x.is_some()) {
        out
    } else {
        vec![]
    }
}
/// MO-10f: a result's field rows, `{ data: pending fails(Error) T }` — taken out of the type text, by field; the row words
/// are `.rx`'s own (CN-4a), so a field reads as an `.rx` value with those rows would (MO-8i).
pub(crate) fn field_rows(t: &str) -> (String, Vec<(String, bool, Vec<String>)>) {
    // a record type, field by field, nested records too; each field's rows are kept by its path (`result.data`)
    fn walk(x: &str, prefix: &str, held: &mut Vec<(String, bool, Vec<String>)>) -> String {
        if !(x.starts_with('{') && x.ends_with('}') && x.len() >= 2) {
            return x.to_string();
        }
        let fs: Vec<String> = split_top(&x[1..x.len() - 1], ",;")
            .iter()
            .map(|f| {
                let Some(i) = f.find(':') else { return f.clone() };
                let key = js_trim(&f[..i]).to_string();
                let mut rest = js_trim(&f[i + 1..]).to_string();
                let (mut holds, mut fails, mut any) = (false, vec![], false);
                while let Some(m) = ROW_WORD.captures(&rest) {
                    any = true;
                    if &m[1] == "pending" {
                        holds = true;
                    } else {
                        fails = m[2].split('|').map(|y| y.trim().to_string()).filter(|y| !y.is_empty()).collect();
                    }
                    rest = rest[m[0].len()..].to_string();
                }
                let path = format!("{}{}", prefix, field_name(&key));
                if any {
                    held.push((path.clone(), holds, fails));
                }
                format!("{}: {}", key, walk(&rest, &format!("{}.", path), held))
            })
            .collect();
        format!("{{ {} }}", fs.join("; "))
    }
    if !ANY_ROW_WORD.is_match(t) {
        return (t.to_string(), vec![]); // no rows: the type text is kept as written
    }
    let mut held = vec![];
    let text = walk(t, "", &mut held);
    if held.is_empty() {
        (t.to_string(), held)
    } else {
        (text, held)
    }
}
/// MO-8d: a declaration's type parameters, `<const S extends string>`, as text (TypeScript's: the checker reads none of it).
fn type_params(c: &mut Cursor) -> Option<String> {
    if c.peek() != '<' {
        return None;
    }
    let t0 = c.i;
    let mut depth = 0;
    loop {
        let ch = c.peek();
        if ch == '<' {
            depth += 1;
        } else if ch == '>' && !c.src[..c.i].ends_with('=') {
            depth -= 1;
        }
        c.bump();
        if c.eof() || depth == 0 {
            break;
        }
    }
    Some(c.src[t0..c.i].to_string())
}

fn params_typed(c: &mut Cursor) -> R<(Vec<String>, Vec<Option<String>>)> {
    let mut params = vec![];
    let mut ptypes = vec![];
    while !c.starts_with(")") {
        params.push(c.ident_or("param")?);
        ptypes.push(opt_type(c, false)?);
        c.ws(true);
        if !c.eat(",") {
            break;
        }
        c.ws(true);
    }
    Ok((params, ptypes))
}

/// RG-4b, 07 §5: a destructuring pattern, `{ a, b: c, d = 1, e: { f }, ...rest }` or `[a, , b, ...rest]`.
enum Pat {
    Name { name: String, line: usize, span: Span },
    Obj(Vec<(String, Pat, Option<Expr>)>, Option<Box<Pat>>),
    Arr(Vec<Option<(Pat, Option<Expr>)>>, Option<Box<Pat>>),
}
/// `...name`, the last element of a pattern closed by `close`.
fn parse_rest(c: &mut Cursor, close: &str) -> R<Pat> {
    c.i += 3;
    c.ws(true);
    let (line, start) = (c.line(), c.i);
    let name = match c.ident() {
        Some(n) if !is_kw(&n) => n,
        _ => return c.fail("a name for the rest"),
    };
    let span = Span::new(start, c.i);
    c.ws(true);
    if !c.starts_with(close) {
        return c.fail(&format!("a rest element is last, with no default: `...{name}{close}`"));
    }
    Ok(Pat::Name { name, line, span })
}
fn pat_default(c: &mut Cursor) -> R<Option<Expr>> {
    if c.peek() == '=' && c.peek_at(1) != '=' && c.peek_at(1) != '>' {
        c.bump();
        c.ws(true);
        return Ok(Some(parse_expr(c)?));
    }
    Ok(None)
}
fn parse_pattern(c: &mut Cursor) -> R<Pat> {
    c.ws(true);
    if c.eat("{") {
        let mut props = vec![];
        loop {
            c.ws(true);
            if c.starts_with("}") {
                break;
            }
            if c.starts_with("...") {
                let rest = parse_rest(c, "}")?;
                c.expect("}")?;
                return Ok(Pat::Obj(props, Some(Box::new(rest))));
            }
            let (kline, kstart) = (c.line(), c.i);
            let key = c.ident_or("a field name")?;
            let kspan = Span::new(kstart, c.i);
            c.ws(true);
            let pat = if c.eat(":") { parse_pattern(c)? } else { Pat::Name { name: key.clone(), line: kline, span: kspan } };
            c.ws(true);
            let dflt = pat_default(c)?;
            props.push((key, pat, dflt));
            c.ws(true);
            if !c.eat(",") {
                break;
            }
        }
        c.ws(true);
        c.expect("}")?;
        return Ok(Pat::Obj(props, None));
    }
    if c.eat("[") {
        let mut items = vec![];
        loop {
            c.ws(true);
            if c.starts_with("]") {
                break;
            }
            if c.starts_with(",") {
                c.bump();
                items.push(None);
                continue;
            }
            if c.starts_with("...") {
                let rest = parse_rest(c, "]")?;
                c.expect("]")?;
                return Ok(Pat::Arr(items, Some(Box::new(rest))));
            }
            let pat = parse_pattern(c)?;
            c.ws(true);
            let dflt = pat_default(c)?;
            items.push(Some((pat, dflt)));
            c.ws(true);
            if !c.eat(",") {
                break;
            }
        }
        c.ws(true);
        c.expect("]")?;
        return Ok(Pat::Arr(items, None));
    }
    let (line, start) = (c.line(), c.i);
    let name = c.ident();
    match name {
        Some(n) if !is_kw(&n) => Ok(Pat::Name { name: n, line, span: Span::new(start, c.i) }),
        _ => c.fail("a name to bind"),
    }
}
/// Each name a pattern binds, with its projection of `base` (a default applies when the field is `undefined`, as in JS).
/// The projections are the parser's own: they have no span (CP-8). An object rest is `omit` of the named keys: Solid's
/// live view in reactive scope, a copy of it when `snap` (a `let`).
fn expand_pattern(pat: &Pat, base: Expr, out: &mut Vec<(String, Expr, usize, Span)>, snap: bool) {
    let syn = |k: ExprKind| Expr::new(k, Span::NONE);
    let dfl = |v: Expr, d: &Option<Expr>| match d {
        Some(d) => syn(ExprKind::If {
            c: Box::new(syn(ExprKind::Bin { op: "==".into(), l: Box::new(v.clone()), r: Box::new(syn(ExprKind::Lit(Lit::Undefined))) })),
            t: Box::new(d.clone()),
            f: Box::new(v),
        }),
        None => v,
    };
    match pat {
        Pat::Name { name, line, span } => out.push((name.clone(), base, *line, *span)),
        Pat::Obj(props, rest) => {
            for (key, p, d) in props {
                let v = syn(ExprKind::Member { o: Box::new(base.clone()), p: key.clone(), opt: false });
                expand_pattern(p, dfl(v, d), out, snap);
            }
            if let Some(r) = rest {
                let o = syn(ExprKind::Omit { e: Box::new(base.clone()), keys: props.iter().map(|(k, _, _)| k.clone()).collect() });
                expand_pattern(r, if snap { syn(ExprKind::Rec(vec![Field::Spread(o)])) } else { o }, out, snap);
            }
        }
        Pat::Arr(items, rest) => {
            for (i, it) in items.iter().enumerate() {
                if let Some((p, d)) = it {
                    let v = syn(ExprKind::Index { o: Box::new(base.clone()), i: Box::new(syn(ExprKind::Lit(Lit::Num(i as f64)))), opt: false });
                    expand_pattern(p, dfl(v, d), out, snap);
                }
            }
            if let Some(r) = rest {
                let f = syn(ExprKind::Member { o: Box::new(base.clone()), p: "slice".into(), opt: false });
                expand_pattern(r, syn(ExprKind::Call { f: Box::new(f), args: vec![syn(ExprKind::Lit(Lit::Num(items.len() as f64)))], targs: None }), out, snap);
            }
        }
    }
}
/// A right side that is read again per name without asking twice: a name or a path of names.
fn is_path(e: &Expr) -> bool {
    match &e.k {
        ExprKind::Id(_) => true,
        ExprKind::Member { o, opt: false, .. } => is_path(o),
        _ => false,
    }
}
/// At a block's `{ … } = e` or `[ … ] = e`: a destructuring declaration, not a read in the view.
fn destructuring_ahead(c: &Cursor) -> bool {
    let open = c.peek();
    if open != '{' && open != '[' {
        return false;
    }
    let b = c.src.as_bytes();
    let (mut depth, mut j) = (0i64, c.i);
    while j < b.len() {
        let ch = b[j];
        if ch == b'{' || ch == b'[' {
            depth += 1;
        } else if ch == b'}' || ch == b']' {
            depth -= 1;
            if depth == 0 {
                break;
            }
        } else if ch == b'"' || ch == b'\'' {
            let q = ch;
            j += 1;
            while j < b.len() && b[j] != q && b[j] != b'\n' {
                if b[j] == b'\\' {
                    j += 1;
                }
                j += 1;
            }
        } else if ch == b'\n' || ch == b'<' || ch == b'`' {
            return false;
        }
        j += 1;
    }
    let rest = &c.src[(j + 1).min(c.src.len())..];
    let t = rest.trim_start_matches([' ', '\t']);
    t.starts_with('=') && !t.starts_with("==") && !t.starts_with("=>")
}
/// RG-4b: `{ a, b } = e` is one equation per name, each a projection of `e` that keeps updating.
fn parse_destructuring_decl(c: &mut Cursor) -> R<Vec<Decl>> {
    let (line, start) = (c.line(), c.i);
    let pat = parse_pattern(c)?;
    c.ws(true);
    c.expect("=")?;
    c.ws(true);
    // `[n, setN] = createSignal(0)`: JS_API's hint
    // — unless the module imports that name from a declared JS module (`[todos, setTodos] = createStore(…)`, MO-10i)
    let line0 = c.src[c.i..].split('\n').next().unwrap_or("");
    if let Some(m) = JS_APIS.captures(line0) {
        if m.get(0).is_some_and(|x| x.start() == 0) && !c.imported.contains(&m[1]) {
            return c.fail("a hook's pair is not .rx");
        }
    }
    let mut base = parse_expr(c)?;
    let mut out = vec![];
    if !is_path(&base) {
        c.temps += 1;
        let t = format!("$${}", c.temps);
        out.push(Decl::Eq { name: t.clone(), e: base, line, span: Span::new(start, c.i), deferred: false, key: None, ty: None, exported: false });
        base = Expr::new(ExprKind::Id(t), Span::NONE);
    }
    let mut names = vec![];
    expand_pattern(&pat, base, &mut names, false);
    for (name, e, line, span) in names {
        out.push(Decl::Eq { name, e, line, span, deferred: false, key: None, ty: None, exported: false });
    }
    Ok(out)
}
/// One declaration, or the several a destructuring declares.
fn parse_decls1(c: &mut Cursor) -> R<Vec<Decl>> {
    c.ws(true);
    if destructuring_ahead(c) {
        return parse_destructuring_decl(c);
    }
    Ok(vec![parse_decl(c)?])
}

fn parse_decl(c: &mut Cursor) -> R<Decl> {
    c.ws(true);
    let start = c.i;
    let mut d = parse_decl_at(c)?;
    d.set_span(Span::new(start, c.i));
    Ok(d)
}
fn parse_decl_at(c: &mut Cursor) -> R<Decl> {
    let line = c.line();
    if c.keyword("export") {
        c.ws(true);
        if c.keyword("default") {
            c.ws(true);
            let mut d = parse_decl(c)?;
            match &mut d {
                Decl::Component { exported, is_default, .. } => {
                    *exported = true;
                    *is_default = true;
                }
                _ => return c.fail("export default: only a component is a module's default export (the app's entry, MO-1c)"),
            }
            return Ok(d);
        }
        let mut d = parse_decl(c)?;
        if matches!(d, Decl::Import { .. } | Decl::Effect { .. } | Decl::Provide { .. }) {
            return c.fail("export of a non-declaration");
        }
        d.set_exported();
        return Ok(d);
    }
    if c.keyword("import") {
        c.ws(true);
        if c.peek() == '"' || c.peek() == '\'' {
            // 07 §1a: `import "./styles.css"`, for its effect (a stylesheet, a polyfill)
            let from = match parse_primary(c)?.k {
                ExprKind::Lit(Lit::Str(s)) => s,
                _ => return c.fail("module path"),
            };
            if from.ends_with(".rx") {
                return c.fail(&format!("import \"{}\": an .rx module is imported for what it exports, `import {{ … }} from \"{}\"`", from, from));
            }
            return Ok(Decl::Import { names: vec![], from, pure: false, side: None, line, span: Span::NONE, fails: None, resolved: None, declared: None, declared_errors: None, declared_error_fields: None, declared_pure: None, declared_side: None });
        }
        let side = if IMPORT_SIDE.is_match(c.rest()) {
            if c.keyword("server") {
                Some(Side::Server)
            } else {
                c.keyword("client");
                Some(Side::Client)
            }
        } else {
            None
        };
        c.ws(true);
        let pure = c.keyword("pure");
        c.ws(true);
        let mut names = vec![];
        if c.eat("{") {
            c.ws(true);
            while !c.starts_with("}") {
                let name = c.ident_or("import name")?;
                c.ws(true);
                let mut alias = name.clone();
                if c.keyword("as") {
                    c.ws(true);
                    alias = c.ident_or("alias")?;
                    c.ws(true);
                }
                c.imported.insert(alias.clone());
                names.push(ImportName { name, alias });
                if !c.eat(",") {
                    break;
                }
                c.ws(true);
            }
            c.expect("}")?;
        } else {
            let name = c.ident_or("import name")?;
            c.imported.insert(name.clone());
            names.push(ImportName { name: "default".into(), alias: name });
        }
        c.ws(true);
        if !c.keyword("from") {
            return c.fail("from");
        }
        c.ws(true);
        let from = match parse_primary(c)?.k {
            ExprKind::Lit(Lit::Str(s)) => s,
            _ => return c.fail("module path"),
        };
        let save = c.i;
        c.ws(false);
        let mk = |fails| Decl::Import { names, from, pure, side, line, span: Span::NONE, fails, resolved: None, declared: None, declared_errors: None, declared_error_fields: None, declared_pure: None, declared_side: None };
        if c.keyword("fails") {
            c.ws(true);
            let fails = parse_classes(c)?.unwrap_or_else(|| vec!["Error".to_string()]);
            return Ok(mk(Some(fails)));
        }
        c.i = save;
        return Ok(mk(None));
    }
    if ERROR_DECL.is_match(c.rest()) {
        c.keyword("error");
        c.ws(true);
        let name = c.ident_or("error class name")?;
        c.ws(false);
        let mut params = vec![];
        let mut ptypes = vec![];
        if c.eat("(") {
            c.ws(true);
            while !c.starts_with(")") {
                params.push(c.ident_or("field")?);
                ptypes.push(opt_type(c, false)?);
                c.ws(true);
                if !c.eat(",") {
                    break;
                }
                c.ws(true);
            }
            c.expect(")")?;
        }
        let save = c.i;
        c.ws(false);
        if c.eat("=>") {
            c.ws(true);
            let msg = parse_expr(c)?;
            return Ok(Decl::Error { name, params, ptypes, msg: Some(msg), line, span: Span::NONE, exported: false });
        }
        c.i = save;
        return Ok(Decl::Error { name, params, ptypes, msg: None, line, span: Span::NONE, exported: false });
    }
    if TYPE_DECL.is_match(c.rest()) {
        let t0 = c.i;
        let _ = c.keyword("type") || c.keyword("interface");
        c.ws(true);
        let name = c.ident_or("type name")?;
        c.ws(true);
        if c.eat("=") {
            c.ws(true);
            parse_type(c, false, true)?;
        } else {
            c.expect("{")?;
            let mut depth = 1;
            while !c.eof() && depth != 0 {
                if c.peek() == '{' {
                    depth += 1;
                }
                if c.peek() == '}' {
                    depth -= 1;
                }
                c.bump();
            }
        }
        return Ok(Decl::TypeDecl { name, line, span: Span::NONE, text: c.src[t0..c.i].to_string(), exported: false });
    }
    if c.keyword("source") {
        c.ws(true);
        let name = c.ident_or("source name")?;
        let (ty, mut key) = split_key(opt_type(c, false)?);
        c.ws(true);
        if SOURCE_KEY.is_match(c.rest()) {
            c.keyword("key");
            c.ws(true);
            key = Some(c.ident_or("key name")?);
            c.ws(true);
        }
        if c.eat(":=") {
            c.ws(true);
            let init = parse_expr(c)?;
            return Ok(Decl::Source { name, init, line, span: Span::NONE, question: false, ty, exported: false, key });
        }
        c.expect("=")?;
        c.ws(true);
        let init = parse_expr(c)?;
        return Ok(Decl::Source { name, init, line, span: Span::NONE, question: true, ty, exported: false, key });
    }
    if c.keyword("effect") {
        c.ws(true);
        c.expect("(")?;
        c.ws(true);
        let mut inputs = vec![];
        while !c.starts_with(")") {
            inputs.push(parse_expr(c)?);
            c.ws(true);
            if !c.eat(",") {
                break;
            }
            c.ws(true);
        }
        c.expect(")")?;
        c.ws(true);
        let body = parse_block(c)?;
        return Ok(Decl::Effect { inputs, body, line, span: Span::NONE });
    }
    if c.keyword("deferred") {
        c.ws(true);
        let name = c.ident_or("deferred name")?;
        let ty = opt_type(c, false)?;
        c.ws(true);
        c.expect("=")?;
        c.ws(true);
        let e = parse_expr(c)?;
        return Ok(Decl::Eq { name, e, line, span: Span::NONE, deferred: true, key: None, ty, exported: false });
    }
    if c.keyword("action") {
        c.ws(true);
        let name = c.ident_or("action name")?;
        c.ws(true);
        c.expect("(")?;
        c.ws(true);
        let (params, ptypes) = params_typed(c)?;
        c.expect(")")?;
        c.ws(true);
        let body = parse_block(c)?;
        return Ok(Decl::Action { name, params, ptypes, body, line, span: Span::NONE, exported: false });
    }
    if SERVER_DECL.is_match(c.rest()) {
        c.keyword("server");
        c.ws(true);
        if c.keyword("action") {
            return c.fail("`server fn` (SF-1: one form — it is io when its body is; there is no `server action`)");
        }
        c.keyword("fn");
        c.ws(true);
        let name = c.ident_or("server function name")?;
        c.ws(true);
        c.expect("(")?;
        c.ws(true);
        let (params, ptypes) = params_typed(c)?;
        c.expect(")")?;
        let ret = opt_type(c, true)?;
        c.ws(true);
        let body = parse_block(c)?;
        return Ok(Decl::Server { name, params, ptypes, ret, body, line, span: Span::NONE, exported: false });
    }
    if c.keyword("context") {
        c.ws(true);
        let name = c.ident_or("context name")?;
        c.ws(false);
        let mut ty = None;
        let mut source = false;
        if c.peek() == ':' && c.peek_at(1) != '=' {
            c.bump();
            c.ws(true);
            source = c.keyword("source");
            c.ws(true);
            ty = Some(parse_type(c, false, false)?);
        }
        let save = c.i;
        c.ws(false);
        if c.peek() == '=' && c.peek_at(1) != '=' && c.peek_at(1) != '>' {
            c.bump();
            c.ws(true);
            let dflt = parse_expr(c)?;
            return Ok(Decl::Context { name, ty, source, dflt: Some(dflt), line, span: Span::NONE, exported: false });
        }
        c.i = save;
        return Ok(Decl::Context { name, ty, source, dflt: None, line, span: Span::NONE, exported: false });
    }
    if c.keyword("provide") {
        c.ws(true);
        let name = c.ident_or("provide name")?;
        c.ws(true);
        c.expect("=")?;
        c.ws(true);
        let e = parse_expr(c)?;
        return Ok(Decl::Provide { name, e, line, span: Span::NONE });
    }
    if c.keyword("fn") {
        c.ws(true);
        let name = c.ident_or("fn name")?;
        c.ws(true);
        c.expect("(")?;
        c.ws(true);
        let mut params = vec![];
        while !c.starts_with(")") {
            let r = c.keyword("ref");
            c.ws(true);
            let pname = c.ident_or("param")?;
            let ty = opt_type(c, false)?;
            params.push(Param { name: pname, r#ref: r, ty });
            c.ws(true);
            if !c.eat(",") {
                break;
            }
            c.ws(true);
        }
        c.expect(")")?;
        let ret = opt_type(c, true)?;
        c.ws(true);
        if c.eat("=>") {
            c.ws(true);
            let tail = parse_expr(c)?;
            return Ok(Decl::Fn { name, params, decls: vec![], tail, line, span: Span::NONE, ret, exported: false });
        }
        c.expect("{")?;
        let mut decls = vec![];
        loop {
            c.ws(true);
            if !looks_like_decl(c) {
                break;
            }
            decls.extend(parse_decls1(c)?);
            c.ws(true);
            c.eat(";");
        }
        c.ws(true);
        let tail = parse_expr(c)?;
        c.ws(true);
        c.expect("}")?;
        return Ok(Decl::Fn { name, params, decls, tail, line, span: Span::NONE, ret, exported: false });
    }
    if c.keyword("component") {
        c.ws(true);
        let name = c.ident_or("component name")?;
        c.ws(true);
        c.expect("(")?;
        c.ws(true);
        // RG-4b: `component C({ a, b })` — each name a projection of props
        let sig = if c.peek() == '{' { Some(parse_pattern(c)?) } else { None };
        let no_props = sig.is_none() && c.peek() == ')'; // `component C()`: no props (RG-4b)
        let props = if sig.is_some() || c.peek() == ')' { "props".to_string() } else { c.ident_or("props name")? };
        let props_type = opt_type(c, false)?;
        c.ws(true);
        c.expect(")")?;
        c.ws(true);
        c.expect("{")?;
        let (mut decls, view) = parse_block_body(c)?;
        if let Some(sig) = &sig {
            let mut names = vec![];
            expand_pattern(sig, Expr::new(ExprKind::Id(props.clone()), Span::NONE), &mut names, false);
            let pre: Vec<Decl> = names.into_iter().map(|(name, e, line, span)| Decl::Eq { name, e, line, span, deferred: false, key: None, ty: None, exported: false }).collect();
            decls.splice(0..0, pre);
        }
        return Ok(Decl::Component { name, props, decls, view, line, span: Span::NONE, props_type, no_props, exported: false, is_default: false });
    }
    let save = c.i;
    let name = c.ident();
    c.ws(false);
    let mut key = None;
    let mut ty = None;
    let plain = name.as_deref().is_some_and(|n| !is_kw(n));
    if plain {
        let (t, k) = split_key(opt_type(c, false)?);
        ty = t;
        key = k;
        c.ws(false);
    }
    if plain && EQ_KEY.is_match(c.rest()) {
        c.keyword("key");
        c.ws(true);
        key = Some(c.ident_or("key name")?);
        c.ws(false);
    }
    if plain && c.peek() == '=' && c.peek_at(1) != '=' && c.peek_at(1) != '>' {
        c.bump();
        c.ws(true);
        let e = parse_expr(c)?;
        return Ok(Decl::Eq { name: name.unwrap(), e, line, span: Span::NONE, deferred: false, key, ty, exported: false });
    }
    c.i = save;
    if c.peek_ident().is_some() && WRITE_AHEAD.is_match(c.rest()) {
        return c.fail("W-2: write in reactive scope (no statement position)");
    }
    c.fail("declaration")
}

pub fn parse_block(c: &mut Cursor) -> R<Vec<Stmt>> {
    c.ws(true);
    c.expect("{")?;
    c.ws(true);
    let mut out = vec![];
    while !c.starts_with("}") {
        out.push(parse_stmt(c)?);
        out.append(&mut c.pending);
        c.ws(true);
        c.eat(";");
        c.ws(true);
    }
    c.expect("}")?;
    Ok(out)
}

pub fn parse_stmts(src: &str) -> R<Vec<Stmt>> {
    let mut c = Cursor::new(src);
    let mut out = vec![];
    c.ws(true);
    while !c.eof() {
        out.push(parse_stmt(&mut c)?);
        out.append(&mut c.pending);
        c.ws(true);
        c.eat(";");
        c.ws(true);
    }
    Ok(out)
}

fn parse_path(c: &mut Cursor) -> R<Vec<PathSeg>> {
    let mut path = vec![];
    loop {
        if c.eat(".") {
            path.push(PathSeg::Name(c.ident_or("member")?));
        } else if c.eat("[") {
            c.ws(true);
            path.push(PathSeg::Expr(parse_expr(c)?));
            c.ws(true);
            c.expect("]")?;
        } else {
            break;
        }
    }
    Ok(path)
}

fn parse_stmt(c: &mut Cursor) -> R<Stmt> {
    c.ws(true);
    let start = c.i;
    if c.keyword("guess") {
        c.ws(true);
        let name = c.ident_or("target")?;
        let path = parse_path(c)?;
        c.ws(true);
        c.expect(":=")?;
        c.ws(true);
        let e = parse_expr(c)?;
        return Ok(st(start, StmtKind::Optimistic { target: Target { name, path, ctx: None }, e }, c));
    }
    if c.keyword("refresh") {
        c.ws(true);
        return Ok(st(start, StmtKind::Refresh(c.ident_or("name")?), c));
    }
    if c.keyword("affects") {
        c.ws(true);
        return Ok(st(start, StmtKind::Affects(c.ident_or("name")?), c));
    }
    if c.keyword("action") {
        c.ws(true);
        return Ok(st(start, StmtKind::Action(parse_block(c)?), c));
    }
    if c.keyword("let") || c.keyword("const") {
        c.ws(true);
        if c.peek() == '{' || c.peek() == '[' {
            // 07 §5: a destructuring local — each name a snapshot, as in JS
            let pat = parse_pattern(c)?;
            c.ws(true);
            c.expect("=")?;
            c.ws(true);
            let mut base = parse_expr(c)?;
            let mut out = vec![];
            if !is_path(&base) {
                c.temps += 1;
                let t = format!("$${}", c.temps);
                out.push(st(start, StmtKind::Let { name: t.clone(), e: base, ty: None }, c));
                base = Expr::new(ExprKind::Id(t), Span::NONE);
            }
            let mut names = vec![];
            expand_pattern(&pat, base, &mut names, true);
            for (name, e, _, span) in names {
                out.push(Stmt { k: StmtKind::Let { name, e, ty: None }, span, line: st_line(start, c) });
            }
            if out.is_empty() {
                return c.fail("a destructuring that binds nothing");
            }
            let first = out.remove(0);
            c.pending.extend(out);
            return Ok(first);
        }
        let name = c.ident_or("let name")?;
        let ty = opt_type(c, false)?;
        c.ws(true);
        c.expect("=")?;
        c.ws(true);
        let e = parse_expr(c)?;
        return Ok(st(start, StmtKind::Let { name, e, ty }, c));
    }
    if c.keyword("try") {
        c.ws(true);
        let body = parse_block(c)?;
        c.ws(true);
        let mut catch_name = None;
        let mut handler = None;
        let mut fin = None;
        let mut catch_classes = None;
        if c.keyword("catch") {
            c.ws(true);
            if c.eat("(") {
                c.ws(true);
                catch_name = Some(c.ident_or("catch name")?);
                c.ws(false);
                if c.eat(":") {
                    catch_classes = parse_classes(c)?;
                }
                c.ws(true);
                c.expect(")")?;
            }
            c.ws(true);
            handler = Some(parse_block(c)?);
            c.ws(true);
        }
        if c.keyword("finally") {
            c.ws(true);
            fin = Some(parse_block(c)?);
        }
        if handler.is_none() && fin.is_none() {
            return c.fail("catch or finally");
        }
        return Ok(st(start, StmtKind::Try { body, catch_name, catch_classes, handler, fin }, c));
    }
    if c.keyword("throw") {
        c.ws(true);
        return Ok(st(start, StmtKind::Throw(parse_expr(c)?), c));
    }
    if c.keyword("return") {
        c.ws(false);
        if c.peek() == '}' || c.peek() == ';' || c.peek() == '\n' || c.eof() {
            return Ok(st(start, StmtKind::Return(None), c));
        }
        return Ok(st(start, StmtKind::Return(Some(parse_expr(c)?)), c));
    }
    if c.keyword("if") {
        c.ws(true);
        c.expect("(")?;
        c.ws(true);
        let cond = parse_expr(c)?;
        c.ws(true);
        c.expect(")")?;
        c.ws(true);
        let t = if c.peek() == '{' { parse_block(c)? } else { let mut v = vec![parse_stmt(c)?]; v.append(&mut c.pending); v };
        c.ws(true);
        let mut f = vec![];
        if c.keyword("else") {
            c.ws(true);
            f = if c.peek() == '{' { parse_block(c)? } else { let mut v = vec![parse_stmt(c)?]; v.append(&mut c.pending); v };
        }
        return Ok(st(start, StmtKind::Sif { c: cond, t, f }, c));
    }
    // 07 §5: `for (const x of e) { … }` — a loop over what `e` holds now, its body imperative scope
    if c.keyword("for") {
        c.ws(true);
        c.expect("(")?;
        c.ws(true);
        if !(c.keyword("const") || c.keyword("let")) {
            return c.fail("`for (const x of e) { … }`: the loop of imperative scope binds one name per turn");
        }
        c.ws(true);
        let name = c.ident_or("loop variable")?;
        c.ws(true);
        if !c.keyword("of") {
            return c.fail("`of`: the loop of imperative scope is `for (const x of e) { … }`");
        }
        c.ws(true);
        let e = parse_expr(c)?;
        c.ws(true);
        c.expect(")")?;
        c.ws(true);
        let body = parse_block(c)?;
        return Ok(st(start, StmtKind::For { name, e, body }, c));
    }
    // write?  target := expr
    let save = c.i;
    let mut name = c.ident();
    let mut ctx = false;
    if name.as_deref() == Some("use") {
        c.ws(true);
        name = Some(c.ident_or("provision name")?);
        ctx = true;
    }
    if let Some(n) = name {
        if !is_kw(&n) || ctx {
            let path = parse_path(c)?;
            c.ws(false);
            if c.eat(":=") {
                c.ws(true);
                let e = parse_expr(c)?;
                return Ok(st(start, StmtKind::Write { target: Target { name: n, path, ctx: Some(ctx) }, e }, c));
            }
        }
    }
    c.i = save;
    Ok(st(start, StmtKind::Expr(parse_expr(c)?), c))
}

// ---- expressions ----
/// An expression, with any trailing `catch (x: A | B) => alt` (R-f-4).
pub fn parse_expr(c: &mut Cursor) -> R<Expr> {
    let mut e = parse_expr_no_catch(c)?;
    let start = e.span.start as usize;
    loop {
        let save = c.i;
        c.ws(true);
        if !c.keyword("catch") {
            c.i = save;
            return Ok(e);
        }
        c.ws(true);
        let mut name = None;
        let mut classes = None;
        if c.eat("(") {
            c.ws(true);
            name = Some(c.ident_or("catch name")?);
            c.ws(false);
            if c.eat(":") {
                classes = parse_classes(c)?;
            }
            c.ws(true);
            c.expect(")")?;
            c.ws(true);
        }
        c.expect("=>")?;
        c.ws(true);
        let alt = parse_expr_no_catch(c)?;
        e = Expr::new(ExprKind::Catch { e: Box::new(e), name, classes, alt: Box::new(alt) }, Span::new(start, c.i));
    }
}

fn draft_ahead(c: &Cursor) -> bool {
    if !(c.starts_with("draft") && DRAFT.is_match(c.rest())) {
        return false;
    }
    let b = c.src.as_bytes();
    let mut i = c.i + 5;
    let mut depth = 0;
    while i < b.len() {
        let ch = b[i];
        if ch == b'(' {
            depth += 1;
        } else if ch == b')' {
            depth -= 1;
            if depth == 0 {
                break;
            }
        }
        i += 1;
    }
    let from = (i + 1).min(c.src.len());
    c.src.is_char_boundary(from) && BRACE_AHEAD.is_match(&c.src[from..])
}

fn parse_expr_no_catch(c: &mut Cursor) -> R<Expr> {
    c.ws(true);
    let start = c.i;
    if draft_ahead(c) {
        c.keyword("draft");
        c.ws(true);
        c.expect("(")?;
        c.ws(true);
        let seed = parse_expr(c)?;
        c.ws(true);
        c.expect(")")?;
        c.ws(true);
        let body = parse_block(c)?;
        return Ok(ex(start, ExprKind::Draft { seed: Box::new(seed), body }, c));
    }
    {
        // 07 §3: TS arrow functions, verbatim — `x => e`, `(a, b) => e`
        let save = c.i;
        let mut params = vec![];
        let mut ptypes: Vec<Option<String>> = vec![];
        let mut ok = false;
        if c.peek() == '(' {
            c.bump();
            c.ws(true);
            ok = true;
            while !c.starts_with(")") {
                match c.ident() {
                    Some(id) => params.push(id),
                    None => {
                        ok = false;
                        break;
                    }
                }
                c.ws(true);
                // 07 §3: `(v: string) => …`, the type is TypeScript's
                if c.starts_with(":") && !c.starts_with(":=") {
                    // `:=` is a write, not a type; a type that does not parse is not an arrow's parameter. A `=>` in
                    // it is a function type's (`(g: () => string) => g()`): the arrow's own follows the list's `)`
                    c.bump();
                    c.ws(true);
                    match parse_type(c, false, true) {
                        Ok(t) if !t.trim().is_empty() => ptypes.push(Some(t.trim().to_string())),
                        _ => {
                            ok = false;
                            break;
                        }
                    }
                    c.ws(true);
                } else {
                    ptypes.push(None);
                }
                if !c.eat(",") {
                    break;
                }
                c.ws(true);
            }
            if ok && c.eat(")") {
                c.ws(false);
                ok = c.starts_with("=>");
            } else {
                ok = false;
            }
        } else if let Some(id) = c.ident() {
            if !is_kw(&id) {
                params.push(id);
                c.ws(false);
                ok = c.starts_with("=>");
            }
        }
        if ok {
            c.expect("=>")?;
            c.ws(true);
            if c.peek() == '{' {
                let at = c.i;
                if let Ok(stmts) = parse_block(c) {
                    if stmts.iter().any(|st| !matches!(&st.k, StmtKind::Expr(Expr { k: ExprKind::Id(_), .. }))) {
                        return Ok(ex(start, ExprKind::Fn { params, body: Box::new(Expr::made(ExprKind::Lit(Lit::Undefined))), stmts: Some(stmts), ptypes: ptypes.clone() }, c));
                    }
                }
                c.i = at;
            }
            let body = parse_expr(c)?;
            return Ok(ex(start, ExprKind::Fn { params, body: Box::new(body), stmts: None, ptypes }, c));
        }
        c.i = save;
    }
    if c.keyword("fn") {
        c.ws(true);
        c.expect("(")?;
        c.ws(true);
        let mut params = vec![];
        while !c.starts_with(")") {
            params.push(c.ident_or("param")?);
            c.ws(true);
            if !c.eat(",") {
                break;
            }
            c.ws(true);
        }
        c.expect(")")?;
        c.ws(true);
        c.expect("=>")?;
        c.ws(true);
        let body = parse_expr(c)?;
        return Ok(ex(start, ExprKind::Fn { ptypes: vec![None; params.len()], params, body: Box::new(body), stmts: None }, c));
    }
    let cond = parse_bin(c, 0)?;
    c.ws(false);
    if c.starts_with(":=") {
        return c.fail("W-2: write in reactive scope (no statement position)");
    }
    if c.peek() == '?' && c.peek_at(1) != '.' {
        c.bump();
        c.ws(true);
        let t = parse_expr_no_catch(c)?;
        c.ws(true);
        c.expect(":")?;
        c.ws(true);
        let f = parse_expr_no_catch(c)?;
        return Ok(ex(cond.span.start as usize, ExprKind::If { c: Box::new(cond), t: Box::new(t), f: Box::new(f) }, c));
    }
    Ok(cond)
}

const LEVELS: &[&[&str]] = &[&["??"], &["||"], &["&&"], &["===", "!==", "==", "!="], &["<=", ">=", "<", ">"], &["+", "-"], &["*", "/", "%"]];
fn parse_bin(c: &mut Cursor, lvl: usize) -> R<Expr> {
    if lvl >= LEVELS.len() {
        return parse_unary(c);
    }
    let mut l = parse_bin(c, lvl + 1)?;
    let start = l.span.start as usize;
    loop {
        c.ws(false);
        let op = LEVELS[lvl].iter().find(|o| c.starts_with(o) && !(**o == "-" && c.peek_at(1) == '>'));
        let Some(op) = op else { return Ok(l) };
        c.i += op.len();
        c.ws(true);
        let r = parse_bin(c, lvl + 1)?;
        let op = match *op {
            "===" => "==",
            "!==" => "!=",
            o => o,
        };
        l = Expr::new(ExprKind::Bin { op: op.to_string(), l: Box::new(l), r: Box::new(r) }, Span::new(start, c.i));
    }
}
fn parse_unary(c: &mut Cursor) -> R<Expr> {
    c.ws(true);
    let start = c.i;
    if c.eat("!") {
        return Ok(ex(start, ExprKind::Un { op: "!".into(), e: Box::new(parse_unary(c)?) }, c));
    }
    if c.peek() == '-' && c.peek_at(1) != '>' {
        c.bump();
        return Ok(ex(start, ExprKind::Un { op: "-".into(), e: Box::new(parse_unary(c)?) }, c));
    }
    if c.keyword("pre") {
        c.ws(true);
        let name = c.ident_or("pre name")?;
        c.ws(false);
        if c.eat("->") {
            c.ws(true);
            return Ok(ex(start, ExprKind::Pre { name, init: Some(Box::new(parse_unary(c)?)) }, c));
        }
        return Ok(ex(start, ExprKind::Pre { name, init: None }, c));
    }
    if c.keyword("peek") {
        c.ws(true);
        return Ok(ex(start, ExprKind::Peek(Box::new(parse_unary(c)?)), c));
    }
    if c.keyword("await") {
        let stream = c.eat("*");
        c.ws(true);
        let e = parse_unary(c)?;
        c.ws(false);
        if c.eat("->") {
            c.ws(true);
            let init = parse_unary(c)?;
            return Ok(ex(start, ExprKind::Await { e: Box::new(e), init: Some(Box::new(init)), stream }, c));
        }
        return Ok(ex(start, ExprKind::Await { e: Box::new(e), init: None, stream }, c));
    }
    if c.keyword("latest") {
        c.ws(true);
        return Ok(ex(start, ExprKind::Latest(Box::new(parse_unary(c)?)), c));
    }
    if c.keyword("throw") {
        c.ws(true);
        return Ok(ex(start, ExprKind::Throw(Box::new(parse_unary(c)?)), c));
    }
    if c.keyword("use") {
        c.ws(true);
        return Ok(ex(start, ExprKind::Use(c.ident_or("context name")?), c));
    }
    if c.starts_with("pending?") {
        c.i += 8;
        c.ws(true);
        return Ok(ex(start, ExprKind::Pending(Box::new(parse_unary(c)?)), c));
    }
    parse_postfix(c)
}
fn parse_postfix(c: &mut Cursor) -> R<Expr> {
    let mut e = parse_primary(c)?;
    let start = e.span.start as usize;
    let mut targs: Option<String> = None;
    loop {
        if c.eat("?.") {
            if c.peek() == '[' {
                c.bump();
                c.ws(true);
                let i = parse_expr(c)?;
                c.ws(true);
                c.expect("]")?;
                e = Expr::new(ExprKind::Index { o: Box::new(e), i: Box::new(i), opt: true }, Span::new(start, c.i));
            } else {
                let p = c.member()?;
                e = Expr::new(ExprKind::Member { o: Box::new(e), p, opt: true }, Span::new(start, c.i));
            }
        } else if c.eat(".") {
            let p = c.member()?;
            e = Expr::new(ExprKind::Member { o: Box::new(e), p, opt: false }, Span::new(start, c.i));
        } else if c.peek() == '[' {
            c.bump();
            c.ws(true);
            let i = parse_expr(c)?;
            c.ws(true);
            c.expect("]")?;
            e = Expr::new(ExprKind::Index { o: Box::new(e), i: Box::new(i), opt: false }, Span::new(start, c.i));
        } else if c.peek() == '<' && matches!(e.k, ExprKind::Id(_) | ExprKind::Member { .. }) {
            // 07 §3: type arguments at a call, `f<T>(…)`; else `a < b` stays a comparison
            match type_args_at(&c.src[c.i..]) {
                Some((text, len)) => {
                    c.i += len;
                    targs = Some(text);
                    continue;
                }
                None => return Ok(e),
            }
        } else if c.peek() == '(' {
            c.bump();
            c.ws(true);
            let mut args = vec![];
            while !c.starts_with(")") {
                args.push(parse_expr(c)?);
                c.ws(true);
                if !c.eat(",") {
                    break;
                }
                c.ws(true);
            }
            c.expect(")")?;
            e = Expr::new(ExprKind::Call { f: Box::new(e), args, targs: targs.take() }, Span::new(start, c.i));
        } else {
            return Ok(e);
        }
    }
}
fn parse_primary(c: &mut Cursor) -> R<Expr> {
    c.ws(true);
    let start = c.i;
    if STYLE.is_match(c.rest()) {
        let line = c.line();
        c.i += "<style".len();
        c.ws(true);
        if !c.eat(">") {
            return c.fail("CSS-5: a class map is `<style>…</style>`, with no attributes");
        }
        let Some(end) = c.rest().find("</style>") else { return c.fail("expected </style>") };
        let css = c.rest()[..end].to_string();
        c.i += end + "</style>".len();
        return Ok(ex(start, ExprKind::StyleMap { css, line }, c));
    }
    if SERVER_FN_EXPR.is_match(c.rest()) {
        c.keyword("server");
        c.ws(true);
        c.keyword("fn");
        c.ws(true);
        c.expect("(")?;
        c.ws(true);
        let (params, ptypes) = params_typed(c)?;
        c.expect(")")?;
        let ret = opt_type(c, true)?;
        c.ws(true);
        let body = parse_block(c)?;
        return Ok(ex(start, ExprKind::ServerFn { params, ptypes, ret, body }, c));
    }
    let ch = c.peek();
    if ch == '`' {
        c.bump();
        let mut parts = vec![];
        let mut s = String::new();
        while !c.eof() && c.peek() != '`' {
            if c.starts_with("${") {
                c.i += 2;
                if !s.is_empty() {
                    parts.push(TplPart::Str(std::mem::take(&mut s)));
                }
                c.ws(true);
                parts.push(TplPart::Expr(parse_expr(c)?));
                c.ws(true);
                c.expect("}")?;
                continue;
            }
            if c.peek() == '\\' {
                c.bump();
            }
            if !c.eof() {
                s.push(c.peek());
            }
            c.bump();
        }
        c.expect("`")?;
        if !s.is_empty() || parts.is_empty() {
            parts.push(TplPart::Str(s));
        }
        return Ok(ex(start, ExprKind::Tpl(parts), c));
    }
    if ch == '"' || ch == '\'' {
        c.bump();
        let mut s = String::new();
        while !c.eof() && c.peek() != ch {
            if c.peek() == '\\' {
                c.bump();
            }
            if !c.eof() {
                s.push(c.peek());
            }
            c.bump();
        }
        c.expect(&ch.to_string())?;
        return Ok(ex(start, ExprKind::Lit(Lit::Str(s)), c));
    }
    if let Some(m) = NUMBER.find(c.rest()) {
        let text = m.as_str().to_string();
        c.i += text.len();
        return Ok(ex(start, ExprKind::Lit(Lit::Num(text.replace('_', "").parse::<f64>().unwrap_or(f64::NAN))), c));
    }
    if c.eat("(") {
        c.ws(true);
        let e = parse_expr(c)?;
        c.ws(true);
        c.expect(")")?;
        return Ok(e);
    }
    if c.eat("[") {
        c.ws(true);
        let mut items = vec![];
        while !c.starts_with("]") {
            let s0 = c.i;
            if c.eat("...") {
                c.ws(true);
                items.push(ex(s0, ExprKind::Spread(Box::new(parse_expr(c)?)), c));
            } else {
                items.push(parse_expr(c)?);
            }
            c.ws(true);
            if !c.eat(",") {
                break;
            }
            c.ws(true);
        }
        c.expect("]")?;
        return Ok(ex(start, ExprKind::Arr(items), c));
    }
    if c.eat("{") {
        c.ws(true);
        let mut fields = vec![];
        while !c.starts_with("}") {
            if c.eat("...") {
                c.ws(true);
                fields.push(Field::Spread(parse_expr(c)?));
                c.ws(true);
                if !c.eat(",") {
                    break;
                }
                c.ws(true);
                continue;
            }
            let k0 = c.i;
            let key = match c.ident() {
                Some(k) => k,
                None => {
                    if c.peek() == '"' || c.peek() == '\'' {
                        match parse_primary(c)?.k {
                            ExprKind::Lit(Lit::Str(s)) => s,
                            _ => unreachable!(),
                        }
                    } else {
                        return c.fail("field");
                    }
                }
            };
            c.ws(true);
            if c.eat(":") {
                c.ws(true);
                let v = parse_expr(c)?;
                fields.push(Field::Kv { key, v });
            } else {
                fields.push(Field::Kv { v: Expr::new(ExprKind::Id(key.clone()), Span::new(k0, k0 + key.len())), key });
            }
            c.ws(true);
            if !c.eat(",") {
                break;
            }
            c.ws(true);
        }
        c.expect("}")?;
        return Ok(ex(start, ExprKind::Rec(fields), c));
    }
    if c.keyword("true") {
        return Ok(ex(start, ExprKind::Lit(Lit::Bool(true)), c));
    }
    if c.keyword("false") {
        return Ok(ex(start, ExprKind::Lit(Lit::Bool(false)), c));
    }
    if c.keyword("undefined") {
        return Ok(ex(start, ExprKind::Lit(Lit::Undefined), c));
    }
    if c.keyword("null") {
        return Ok(ex(start, ExprKind::Lit(Lit::Null), c));
    }
    if c.recover && (c.i == 0 || c.src.as_bytes()[c.i - 1] == b'\n') && looks_like_decl(c) {
        c.note("expression");
        return Ok(ex(start, ExprKind::Id(String::new()), c));
    }
    if let Some(id) = c.ident() {
        return Ok(ex(start, ExprKind::Id(id), c));
    }
    if c.recover {
        // a missing expression; what follows (on its own line) is the next declaration's
        c.note("expression");
        return Ok(ex(start, ExprKind::Id(String::new()), c));
    }
    c.fail("expression")
}

// ---- markup ----
#[derive(Clone)]
enum Close {
    /// the top level: markup runs to the end of input
    Top,
    /// a control form's body, up to `}`
    Brace,
    /// an element, up to `</tag>` (`""`: a fragment's `</>`)
    Tag(String),
}

fn parse_markup(c: &mut Cursor, close: Close) -> R<Vec<Markup>> {
    let mut out: Vec<Markup> = vec![];
    let in_element = matches!(close, Close::Tag(_));
    let close_text = match &close {
        Close::Top => None,
        Close::Brace => Some("}".to_string()),
        Close::Tag(t) => Some(t.clone()),
    };
    let mut broke = false;
    loop {
        let start = c.i;
        if in_element {
            let mut s = String::new();
            while !c.eof() && " \t\r\n".contains(c.peek()) {
                s.push(c.peek());
                c.bump();
            }
            broke = s.contains('\n');
            let tag = close_text.as_deref().unwrap();
            if !s.is_empty() && !broke && !c.starts_with(&format!("</{}>", tag)) && !out.is_empty() {
                out.push(Markup { kind: MarkupKind::Text(" ".into()), line: None, span: Span::NONE });
            }
        } else {
            c.ws(true);
        }
        if c.eof() {
            if let Some(t) = &close_text {
                return c.fail(&format!("expected </{}>", t));
            }
            return Ok(out);
        }
        if let Close::Tag(t) = &close {
            if c.starts_with(&format!("</{}>", t)) {
                c.i += t.len() + 3;
                return Ok(out);
            }
        }
        if matches!(close, Close::Brace) && c.starts_with("}") {
            c.bump();
            return Ok(out);
        }
        let line = c.line();
        let m0 = c.i;
        if c.starts_with("<") {
            let mut m = parse_element(c)?;
            m.line = Some(line);
            m.span = Span::new(m0, c.i);
            out.push(m);
            continue;
        }
        if c.starts_with("{") {
            c.bump();
            c.ws(true);
            if let Some(mut ctl) = parse_control(c)? {
                c.ws(true);
                c.expect("}")?;
                ctl.line = Some(line);
                ctl.span = Span::new(m0, c.i);
                out.push(ctl);
                continue;
            }
            let e = parse_expr(c)?;
            c.ws(true);
            c.expect("}")?;
            out.push(Markup { kind: MarkupKind::Read(e), line: Some(line), span: Span::new(m0, c.i) });
            continue;
        }
        if !in_element {
            if let Some(mut ctl) = parse_control(c)? {
                ctl.line = Some(line);
                ctl.span = Span::new(m0, c.i);
                out.push(ctl);
                continue;
            }
        }
        if matches!(close, Close::Top) && looks_like_decl(c) {
            return c.fail("declaration after markup: a block is declarations, then its view");
        }
        let mut s = String::new();
        let s0 = c.i;
        while !c.eof() && !"<{}\n".contains(c.peek()) {
            s.push(c.peek());
            c.bump();
        }
        if c.peek() == '\n' || c.eof() {
            s = s.trim_end_matches([' ', '\t', '\r']).to_string();
        }
        if !in_element {
            if js_trim(&s).is_empty() {
                if c.peek() == '\n' {
                    c.bump();
                }
                if c.i == start {
                    // the reference loops here forever (a stray `}`); this ends it
                    return c.fail("expected a declaration or markup");
                }
                continue;
            }
            if s.contains(":=") {
                return c.fail("W-2: write in reactive scope (no statement position)");
            }
            return c.fail("expected a declaration or markup");
        }
        if broke && matches!(out.last(), Some(Markup { kind: MarkupKind::Text(_), .. })) {
            out.push(Markup { kind: MarkupKind::Text(" ".into()), line: None, span: Span::NONE });
        }
        if !s.is_empty() {
            let span = Span::new(s0, s0 + s.len());
            out.push(Markup { kind: MarkupKind::Text(s), line: None, span });
        }
        if c.i == start {
            // the reference loops here forever (a stray `}` in an element); this ends it
            return c.fail("expected a declaration or markup");
        }
    }
}

/// Control forms of a view: `if c { … } else if d { … } else { … }`, `for x in e { … }`, `loading … { … }`, `errored …`, `portal …`.
fn parse_control(c: &mut Cursor) -> R<Option<Markup>> {
    let save = c.i;
    let mk = |kind| Some(Markup { kind, line: None, span: Span::NONE });
    if c.keyword("if") {
        c.ws(true);
        let cond = parse_expr(c)?;
        c.ws(true);
        if !c.starts_with("{") {
            c.i = save;
            return Ok(None);
        }
        c.expect("{")?;
        let (t_decls, t) = parse_block_body(c)?;
        c.ws(true);
        let (mut f_decls, mut f) = (vec![], vec![]);
        if c.keyword("else") {
            c.ws(true);
            let at = c.i;
            if c.keyword("if") {
                // `else if c { … }` is `else { if c { … } }`
                c.i = at;
                match parse_control(c)? {
                    Some(next) => f = vec![next],
                    None => return c.fail("a block after `else if`: else if c { … }"),
                }
            } else {
                c.expect("{")?;
                (f_decls, f) = parse_block_body(c)?;
            }
        }
        return Ok(mk(MarkupKind::Mif { c: cond, t, t_decls, f, f_decls }));
    }
    if c.keyword("loading") {
        c.ws(true);
        let mut on = None;
        if c.keyword("on") {
            c.ws(true);
            c.expect("(")?;
            c.ws(true);
            on = Some(parse_expr(c)?);
            c.ws(true);
            c.expect(")")?;
            c.ws(true);
        }
        if !c.keyword("fallback") {
            return c.fail("fallback");
        }
        c.ws(true);
        c.expect("{")?;
        let fallback = parse_markup(c, Close::Brace)?;
        c.ws(true);
        c.expect("{")?;
        let (decls, body) = parse_block_body(c)?;
        return Ok(mk(MarkupKind::Loading { on, fallback, decls, body }));
    }
    if c.keyword("portal") {
        c.ws(true);
        let mut to = None;
        if c.keyword("to") {
            c.ws(true);
            c.expect("(")?;
            c.ws(true);
            to = Some(parse_expr(c)?);
            c.ws(true);
            c.expect(")")?;
            c.ws(true);
        }
        c.expect("{")?;
        let (decls, body) = parse_block_body(c)?;
        return Ok(mk(MarkupKind::Portal { to, decls, body }));
    }
    if c.keyword("errored") {
        c.ws(true);
        if !c.keyword("fallback") {
            return c.fail("fallback");
        }
        c.ws(false);
        let mut err_name = None;
        let mut classes = None;
        if c.eat("(") {
            c.ws(true);
            err_name = Some(c.ident_or("error name")?);
            c.ws(false);
            if c.eat(":") {
                classes = parse_classes(c)?;
            }
            c.ws(true);
            c.expect(")")?;
        }
        c.ws(true);
        c.expect("{")?;
        let fallback = parse_markup(c, Close::Brace)?;
        c.ws(true);
        c.expect("{")?;
        let (decls, body) = parse_block_body(c)?;
        return Ok(mk(MarkupKind::Errored { fallback, decls, body, err_name, classes }));
    }
    {
        // MO-11k: `view (a, b) { … }`, only with names in the parentheses and a block after them
        let save = c.i;
        if c.keyword("view") {
            c.ws(true);
            // a named render prop
            let mut prop = None;
            if !c.starts_with("(") {
                if let Some(n) = c.ident() {
                    if !KEYWORDS.contains(n.as_str()) {
                        prop = Some(n);
                        c.ws(true);
                    }
                }
            }
            let mut params = vec![];
            let mut ok = c.eat("(");
            while ok {
                c.ws(true);
                if c.eat(")") {
                    break;
                }
                match c.ident() {
                    Some(n) if !KEYWORDS.contains(n.as_str()) => params.push(n),
                    _ => {
                        ok = false;
                        break;
                    }
                }
                c.ws(true);
                if !c.eat(",") && !c.starts_with(")") {
                    ok = false;
                }
            }
            if ok {
                c.ws(true);
                if c.eat("{") {
                    let (decls, body) = parse_block_body(c)?;
                    return Ok(mk(MarkupKind::Mview { prop, params, decls, body }));
                }
            }
        }
        c.i = save;
    }
    if c.keyword("for") {
        c.ws(true);
        let name = c.ident_or("for name")?;
        c.ws(true);
        if !c.keyword("in") {
            return c.fail("in");
        }
        c.ws(true);
        let xs = parse_expr(c)?;
        c.ws(true);
        c.expect("{")?;
        let (decls, body) = parse_block_body(c)?;
        return Ok(mk(MarkupKind::Mfor { name, xs, decls, body }));
    }
    Ok(None)
}
/// A reactive block body: declarations, then markup, up to the closing `}` (03).
fn parse_block_body(c: &mut Cursor) -> R<(Vec<Decl>, Vec<Markup>)> {
    let mut decls = vec![];
    loop {
        c.ws(true);
        if !looks_like_decl(c) {
            break;
        }
        decls.extend(parse_decls1(c)?);
        c.ws(true);
        c.eat(";");
    }
    Ok((decls, parse_markup(c, Close::Brace)?))
}
fn looks_like_decl(c: &mut Cursor) -> bool {
    let save = c.i;
    c.ws(true);
    let r = destructuring_ahead(c)
        || c.starts_with("source ")
        || c.starts_with("effect")
        || c.starts_with("fn ")
        || c.starts_with("component ")
        || c.starts_with("deferred ")
        || c.starts_with("action ")
        || c.starts_with("provide ")
        || c.starts_with("context ")
        || c.starts_with("import ")
        || c.starts_with("export ")
        || c.starts_with("type ")
        || c.starts_with("interface ")
        || ERROR_DECL.is_match(c.rest())
        || SERVER_DECL.is_match(c.rest())
        || {
            let id = c.ident();
            c.ws(false);
            match id {
                Some(id) if !is_kw(&id) => {
                    if c.peek() == ':' && c.peek_at(1) != '=' {
                        true
                    } else {
                        (c.peek() == '=' && c.peek_at(1) != '=') || EQ_KEY.is_match(c.rest())
                    }
                }
                _ => false,
            }
        };
    c.i = save;
    r
}
fn parse_element(c: &mut Cursor) -> R<Markup> {
    c.expect("<")?;
    let mk = |kind| Markup { kind, line: None, span: Span::NONE };
    if c.eat(">") {
        let children = parse_markup(c, Close::Tag(String::new()))?;
        return Ok(mk(MarkupKind::El { tag: String::new(), attrs: vec![], children }));
    }
    let Some(tag) = c.tag_name() else { return c.fail("tag") };
    if tag == "style" {
        c.ws(true);
        if !c.eat(">") {
            return c.fail(if c.rest().starts_with("ref") {
                "CSS-5: a class map is a declaration, `styles = <style>…</style>` — TSRX's `<style ref={styles}>` assigns into a variable, and a name here is bound once, by its declaration"
            } else {
                "CSS-1: a <style> takes no attributes: `<style>…</style>`"
            });
        }
        let Some(end) = c.rest().find("</style>") else { return c.fail("expected </style>") };
        let css = c.rest()[..end].to_string();
        c.i += end + "</style>".len();
        return Ok(mk(MarkupKind::Style(css)));
    }
    let mut attrs = vec![];
    loop {
        c.ws(true);
        if c.eat("/>") {
            return Ok(mk(MarkupKind::El { tag, attrs, children: vec![] }));
        }
        if c.eat(">") {
            break;
        }
        let a0 = c.i;
        // 07 §4: a spread attribute, `{...e}`: every field of e, in order with the named ones
        if c.starts_with("{") {
            c.eat("{");
            c.ws(true);
            let d0 = c.i;
            if !c.eat("...") {
                return c.fail("attr: an attribute in braces is a spread, `{...props}`");
            }
            let span = Span::new(d0, c.i);
            c.ws(true);
            let e = parse_expr(c)?;
            attrs.push(Attr { name: "...".into(), e, span });
            c.ws(true);
            c.expect("}")?;
            continue;
        }
        let Some(name) = c.tag_name() else { return c.fail("attr") };
        let span = Span::new(a0, c.i);
        c.ws(false);
        if !c.eat("=") {
            attrs.push(Attr { name, e: Expr::new(ExprKind::Lit(Lit::Bool(true)), span), span });
            continue;
        }
        c.ws(true);
        if c.eat("{") {
            c.ws(true);
            let e = parse_expr(c)?;
            attrs.push(Attr { name, e, span });
            c.ws(true);
            c.expect("}")?;
        } else {
            let e = parse_primary(c)?;
            attrs.push(Attr { name, e, span });
        }
    }
    let children = parse_markup(c, Close::Tag(tag.clone()))?;
    Ok(mk(MarkupKind::El { tag, attrs, children }))
}

#[cfg(test)]
mod recovering {
    use super::*;

    fn names(p: &Program) -> Vec<String> {
        p.decls.iter().filter_map(|d| d.name().map(|n| n.to_string())).collect()
    }

    #[test]
    fn half_typed_member_and_expression_still_parse() {
        let src = "source user := { name: \"a\" }\nshown = user.\nnext = \nexport default component App() {\n  <p>{shown}</p>\n}\n";
        let (p, errs) = parse_program_recovering(src);
        assert_eq!(names(&p), ["user", "shown", "next", "App"]);
        assert_eq!(errs.len(), 2);
        let Decl::Eq { e, .. } = &p.decls[1] else { panic!() };
        assert!(matches!(&e.k, ExprKind::Member { p, .. } if p.is_empty()));
        assert_eq!(e.span.text(src), "user.");
    }

    #[test]
    fn a_broken_declaration_is_left_out_and_the_rest_parse() {
        let src = "source a := 1\nfn f(x => x\nb = a + 1\ncomponent Item(props) {\n  <li>{props.x</li>\n}\nexport default component App() {\n  <Item x={b} />\n}\n";
        let (p, errs) = parse_program_recovering(src);
        assert_eq!(names(&p), ["a", "b", "App"]);
        assert_eq!(errs.len(), 2);
        assert!(parse_program(src).is_err());
    }

    /// MO-8d: `component Picker<Option>(…)`, on a member component too; the parameters are the row's text, carried to
    /// its `.d.ts` and to the boundary check, and the props are read as they were
    #[test]
    fn a_component_row_may_have_type_parameters() {
        let src = "export component Picker<Option, G = never>(props: { value?: Option; options: Option[]; onPick?: handler (v: Option) => void }) uses(kit)\nexport component Kit.Row<T extends { id: string }>(props: { row: T })\nexport component Plain(props: { id: string })\n";
        let decls = parse_declarations(src).expect("parses");
        let tps: Vec<Option<&str>> = decls.iter().map(|d| match d { JsDecl::Comp { tparams, .. } => tparams.as_deref(), _ => None }).collect();
        assert_eq!(tps, [Some("<Option, G = never>"), Some("<T extends { id: string }>"), None]);
        let JsDecl::Comp { props, uses, .. } = &decls[0] else { panic!("a component") };
        assert_eq!(props.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), ["value", "options", "onPick"]);
        assert_eq!(uses, &["kit".to_string()]);
        let dts = crate::project::declaration_file(&decls);
        assert!(dts.contains("export declare function Picker<Option, G = never>(props: {"), "{dts}");
        assert!(dts.contains("Row: <T extends { id: string }>(props: { row: T; }) => View;"), "{dts}");
        let (check, _) = crate::project::boundary_file(&decls, "./kit.js");
        assert!(check.contains("type __decl_Picker = <Option, G = never>(props: {"), "{check}");
    }

    /// MO-8o: `props: Kit.SelectProps<Option> & { … }` — the props are the type the library declares, TypeScript's
    /// text, and the record after `&` its fields that carry words; a record alone is read as it was
    #[test]
    fn a_component_row_may_name_its_props_type() {
        let src = "export type PickerProps<O> = { value?: O; options: O[]; onPick?: (v: O) => void; label?: string }\nexport component Picker<Option>(props: PickerProps<Option> & { onPick?: handler (v: Option) => void; item?: Component }) uses(kit)\nexport component Kit.Row(props: import(\"./kit.js\").RowProps<{ a: \")\" } & { b: 1 }>)\nexport component Plain(props: { id: string })\nexport context kit\n";
        let decls = parse_declarations(src).expect("parses");
        let types: Vec<Option<&str>> = decls.iter().filter_map(|d| match d { JsDecl::Comp { props_type, .. } => Some(props_type.as_deref()), _ => None }).collect();
        assert_eq!(types, [Some("PickerProps<Option>"), Some("import(\"./kit.js\").RowProps<{ a: \")\" } & { b: 1 }>"), None]);
        let JsDecl::Comp { props, uses, .. } = &decls[1] else { panic!("a component") };
        assert_eq!(props.iter().map(|p| (p.name.as_str(), p.callback, p.component)).collect::<Vec<_>>(), [("onPick", true, false), ("item", false, true)]);
        assert_eq!(uses, &["kit".to_string()]);
        let JsDecl::Comp { props, .. } = &decls[2] else { panic!("a component") };
        assert!(props.is_empty());
        let dts = crate::project::declaration_file(&decls);
        assert!(dts.contains("export declare function Picker<Option>(props: PickerProps<Option> & { onPick?: (v: Option) => void; item?: Component; }): View;"), "{dts}");
        assert!(dts.contains("Row: (props: import(\"./kit.js\").RowProps<{ a: \")\" } & { b: 1 }>) => View;"), "{dts}");
        let (check, _) = crate::project::boundary_file(&decls, "./kit.js");
        assert!(check.contains("type __decl_Picker = <Option>(props: PickerProps<Option> & NoInfer<{ onPick?: (v: Option) => void; item?: Component; }>) => any;"), "{check}");
        assert!(parse_declarations("export component A(props: & { a: string })\n").is_err());
        // a type that begins with a record is a type all the same: the record that closes the props is the last
        let decls = parse_declarations("export component B(props: { id: string } & Extra & { onPick?: handler () => void })\nexport component C(props: { id: string } & Extra)\n").expect("parses");
        let got: Vec<(Option<&str>, usize)> = decls.iter().map(|d| match d { JsDecl::Comp { props_type, props, .. } => (props_type.as_deref(), props.len()), _ => (None, 0) }).collect();
        assert_eq!(got, [(Some("{ id: string } & Extra"), 1), (Some("{ id: string } & Extra"), 0)]);
    }

    /// MO-11a, MO-10b: TypeScript's `readonly` before a declared prop is a modifier, not part of its name — a library's
    /// props are often an interface of `readonly` fields, and a draft writes them as declared — and a prop may itself be
    /// named `readonly` (an input's).
    #[test]
    fn a_declared_prop_may_be_readonly() {
        let decls = parse_declarations("export component Group(props: { readonly children?: View; readonly id?: string | undefined; readonly onPick?: handler (v: string) => void; readonly?: boolean; readonly readonly: boolean })\n").expect("parses");
        let JsDecl::Comp { props, .. } = &decls[0] else { panic!("a component") };
        assert_eq!(props.iter().map(|p| (p.name.as_str(), p.optional, p.callback)).collect::<Vec<_>>(), [("children", true, false), ("id", true, false), ("onPick", true, true), ("readonly", true, false), ("readonly", false, false)]);
        let dts = crate::project::declaration_file(&decls);
        assert!(dts.contains("id?: string | undefined;") && dts.contains("onPick?: (v: string) => void;"), "{dts}");
    }

    /// MO-8o, TY-6f: each field of the record after a props' type is held against the library's type for that prop —
    /// the prop exists, and the field's type is one the library's takes — with the row's type parameters as types of the
    /// check (a default, else a bound, else a type of its own; `any` where a bound comes back to itself)
    #[test]
    fn a_props_record_is_held_to_the_props_type() {
        let src = "export component Picker<const Option, G = never, T extends Tag = \"div\", K extends keyof K = any, F extends (a: Option) => void = (a: Option) => void, R extends R[]>(props: import(\"./kit.js\").PickerProps<Option, G, T> & { onPick?: handler (v: Option) => void; item?: Component; slot?: renders any })\nexport component Plain(props: PlainProps)\nexport component Rec(props: { onPick?: handler () => void })\n";
        let decls = parse_declarations(src).expect("parses");
        let (check, checks, overlay) = crate::project::boundary_checks(&decls, "./kit.js");
        let held = "interface Option { readonly __rx_type_parameter: \"Option\"; } type G = never; type T = \"div\"; type K = any; type F = (a: Option) => void; type R = any; ";
        let p = "import(\"./kit.js\").PickerProps<Option, G, T>";
        let lines: Vec<&str> = check.lines().collect();
        assert!(lines.contains(&format!("{{ {held}const __has: __rx_has<{p}, \"onPick\"> = true; }}").as_str()), "{check}");
        assert!(lines.contains(&format!("{{ {held}const __is: __rx_prop<{p}, \"onPick\"> | undefined = undefined as unknown as ((v: Option) => void); }}").as_str()), "{check}");
        assert!(lines.contains(&format!("{{ {held}const __is: __rx_prop<{p}, \"item\"> | undefined = undefined as unknown as (Component); }}").as_str()), "{check}");
        assert!(check.contains("type __rx_prop<P, K extends PropertyKey> = ") && check.contains("type __rx_has<P, K extends PropertyKey> = "), "{check}");
        // a check for each field's name, and for each field's type that is written; every one is the row's
        assert_eq!(overlay.iter().map(|o| (o.prop.as_str(), o.has, o.line, o.name.as_str())).collect::<Vec<_>>(), [("onPick", true, 1, "Picker"), ("onPick", false, 1, "Picker"), ("item", true, 1, "Picker"), ("item", false, 1, "Picker"), ("slot", true, 1, "Picker"), ("slot", false, 1, "Picker")]);
        for o in &overlay {
            assert!(lines[o.at - 1].starts_with("{ interface Option") && lines[o.at - 1].contains(&format!("\"{}\"", o.prop)), "{}", lines[o.at - 1]);
            assert!(o.says.contains(&format!("`{}`", o.prop)) && o.says.contains("MO-8o"), "{}", o.says);
        }
        assert!(overlay[1].says.contains("`(v: Option) => void`"), "{}", overlay[1].says);
        // the rows' own checks are as they were: props that are a type alone, or a record alone, have no such line
        assert_eq!(checks.iter().map(|c| (c.1, c.2.as_str())).collect::<Vec<_>>(), [(1, "Picker"), (2, "Plain"), (3, "Rec")]);
        let (plain, _, none) = crate::project::boundary_checks(&parse_declarations("export component Plain(props: PlainProps)\nexport component Rec(props: { onPick?: handler () => void })\n").expect("parses"), "./kit.js");
        assert!(none.is_empty() && !plain.contains("__rx_prop"), "{plain}");
    }

    /// MO-8b: a fn with several signatures is declared by one row; a second row of its name is refused (it was MO-8p's
    /// overload). The declaration's `.d.ts` and the boundary check hold one row an export.
    #[test]
    fn an_export_has_one_row() {
        for bad in [
            "export pure fn on(ref target: Window, type_: string): () => void\nexport pure fn on(ref target: Document, type_: string, options?: boolean): () => void\n",
            "export fn on(a: number): void\nexport fn on(a: string): void\n",
        ] {
            let e = parse_declarations(bad).expect_err(bad);
            assert!(e.0.contains("declared again: an export has one row"), "{}", e.0);
        }
        let decls = parse_declarations("export fn on(a: number | string): void\nexport fn other(): void\n").expect("parses");
        assert_eq!(decls.iter().map(|d| d.name()).collect::<Vec<_>>(), ["on", "other"]);
        let dts = crate::project::declaration_file(&decls);
        assert_eq!(dts.matches("export declare function on(").count(), 1, "{dts}");
        let (check, checks) = crate::project::boundary_file(&decls, "./kit.js");
        assert!(check.contains("const __check_on: __decl_on = __real.on;"), "{check}");
        assert_eq!(checks.iter().map(|c| c.1).collect::<Vec<_>>(), [1, 2]);
    }
    /// MO-8i (pruned 2026-11-22): a word no longer in the vocabulary is refused by name, with what says it now — never
    /// read as type text.
    #[test]
    fn a_word_no_longer_in_the_vocabulary_is_refused() {
        for (bad, word) in [
            ("export pure fn f(route: any): any forwards\n", "`forwards`"),
            ("export pure fn f(config: any): Component nests(children in component) joins(path)\n", "`joins("),
            ("export pure fn f(): any instantiates methods(format)\n", "`methods("),
            ("export fn f(): void trusted\n", "`trusted`"),
            ("export component C(props: {}) trusted\n", "`trusted`"),
            ("export pure fn f(options: { template: Component }): any renders(root)\n", "`renders(root"),
            ("export pure fn f(options: { template: Component }): any renders(root, theme)\n", "`renders(root"),
            ("export pure fn f(ref options: { queryFn: tracked () => Promise<any> }): any\n", "`tracked`"),
            ("export component C(props: { onCompare: tracked (v: number) => number })\n", "`tracked`"),
        ] {
            let e = parse_declarations(bad).expect_err(bad);
            assert!(e.0.contains(word) && e.0.contains("is not a word of a declaration"), "{bad} → {}", e.0);
        }
        // `signal init: T` is no parameter word: the row does not parse
        assert!(parse_declarations("export pure fn makePersisted(signal init: string): [ref string, (v: string) => void]\n").is_err());
        // and a name that is one of them is still a name where a name goes
        let decls = parse_declarations("export pure fn f(signal: string, tracked: boolean, methods?: string[]): { trusted: boolean; forwards: string }\n").expect("parses");
        assert!(matches!(&decls[0], JsDecl::Fn { params, .. } if params == &["signal", "tracked", "methods"]));
    }

    #[test]
    fn function_types_in_props_and_type_aliases() {
        let src = "type Pick = (id: number) => void\ncomponent Row(props: { id: number; onPick: (id: number) => void; onDrop: Pick }) {\n  source n: number := peek(props.id)\n  <li onClick={() => { props.onPick(n) }}>{n}</li>\n}\nfn twice(x: number): number => x * 2\nexport default component App() {\n  <Row id={twice(1)} onPick={id => { log(id) }} onDrop={id => { log(id) }} />\n}\n";
        let p = parse_program(src).expect("parses");
        assert_eq!(names(&p), ["Pick", "Row", "twice", "App"]);
    }
    #[test]
    fn type_arguments_are_parsed_completely() {
        // 07 §3: what TypeScript reads as type arguments is a call; anything else stays comparisons
        for t in [
            "Todos", "string[]", "{ a: string; b?: number }[]", "A | B", "A & { x: 1 }", "Record<string, number>", "Map<K, V[]>", "[a: string, b?: number, ...rest: T[]]",
            "(x: T) => U", "<T>(x: T) => T", "new () => Foo", "K extends keyof T ? T[K] : never", "T[K]", "typeof foo.bar", "import(\"./x\").Y<Z>", "-1 | 0 | 1",
            "\"a\" | 'b'", "`p-${string}`", "{ [K in keyof T]-?: T[K] }", "{ readonly [k: string]: number }", "{ (x: number): string; new (): Foo; m<T>(a: T): void }",
            "keyof T", "readonly string[]", "unique symbol", "T extends (infer U)[] ? U : never", "(x: unknown) => x is string", "A,", "Array<Array<number>>", "this", "{ +readonly [K in T]+?: 1 }", "{\n  done: number\n  items: string[]\n}", "`x${T}-${number}`", "`a${`b${string}`}`", "`k${{ a: 1 }[\"a\"]}`",
            // R4: a `}` in a string inside a substitution does not end it
            "`x${\"}\"}`", "`x${'}'}`", "`x${`}`}`", "`x${\"{\"}`", "{ k: `x${\"}\"}` }", "\"}\"",
        ] {
            assert!(looks_like_types(t), "{t} is a type list");
        }
        for t in ["b[c+1]", "b && c", "b ? c : d", "b + c", "b - c", "b * c", "b(c)", "b = c", "b, c + 1", "!b", "b.c(d)", "b[c]()", "b[0] + 1", "{ a }", "b c", "", "typeof f(x)", "(b, c)", "b == c", "{ a: 1 b: 2 }", "`x${c+1}`", "`x${c(1)}`", "-\"1\"", "-'1'", "-`1`", "import(1)", "`x${\"}\" + 1}`", "`x${\"}\"`"] {
            assert!(!looks_like_types(t), "{t} is not");
        }
    }
    #[test]
    fn a_brace_in_a_string_type_argument_keeps_the_call() {
        // R4 (RFC 11): `}` inside a string, in a template literal type or as a type argument, is not a closer
        for (src, targs) in [("x = f<`k${\"}\"}`>(1)\n", "`k${\"}\"}`"), ("x = f<\"}\">(1)\n", "\"}\""), ("x = f<{ a: `${'}'}` }>(1)\n", "{ a: `${'}'}` }")] {
            let p = parse_program(src).expect("parses");
            let json = serde_json::to_string(&p.to_json()).unwrap();
            assert!(json.contains(&format!("\"targs\":{}", serde_json::to_string(targs).unwrap())), "{src}: {json}");
        }
    }
}
