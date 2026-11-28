/**
 * @jsxImportSource @solidjs/web
 * @vitest-environment jsdom
 */
// The eval board (rx-cols) in plain Solid, driven by a fuzz trail (env TRAIL, ";"-separated). Prints the screen and the server.
import { test } from "vitest";
import { appendFileSync, writeFileSync } from "node:fs";
const OUT = process.env.OUT ?? "/tmp/claude-0/board-model.out"; const log = (...a: any[]) => appendFileSync(OUT, a.join(" ") + "\n");
import { For, action, createSignal, createOptimisticStore, flush, refresh, latest } from "solid-js";
import { render } from "../src/index.js";
const tick = async () => { for (let i = 0; i < 4; i++) { await new Promise(r => setTimeout(r, 0)); flush(); } };
type Row = { id: number; title: string; adding?: boolean };
type Col = "todo" | "doing" | "done";
const COLS: Col[] = ["todo", "doing", "done"];
test("board trail", async () => {
  writeFileSync(OUT, "");
  const srv: Record<Col, Row[]> = { todo: [{ id: 1, title: "Write spec" }, { id: 2, title: "Fix login" }], doing: [{ id: 3, title: "Review PR" }, { id: 4, title: "Deploy" }], done: [{ id: 5, title: "Kickoff" }] };
  let nextCard = 10;
  const fl: Record<string, [(v: any) => void, (e: any) => void][]> = {};
  const ask = (k: string) => new Promise<any>((r, j) => (fl[k] ??= []).push([r, j]));
  const air = () => Object.keys(fl).filter(x => fl[x].length);
  const where = (id: number) => COLS.find(c => srv[c].some(x => x.id === id));
  const answer = (k: string): any => {
    const [name, rest] = [k.slice(0, k.indexOf(":")), k.slice(k.indexOf(":") + 1)]; const a = rest.split(",");
    if (name === "fetchCards") return srv[a[0] as Col].map(x => ({ ...x }));
    if (name === "moveCard") { const id = +a[0]; const w = where(id); if (!w) throw 0; const i = srv[w].findIndex(x => x.id === id); const [x] = srv[w].splice(i, 1); const to = srv[a[1] as Col]; to.splice(Math.min(+a[2], to.length), 0, x); return {}; }
    if (name === "renameCard") { const id = +a[0]; const w = where(id); const x = w && srv[w].find(x => x.id === id); if (!x) throw 0; x.title = a.slice(1).join(","); return { id, title: x.title }; }
    if (name === "archiveCard") { const id = +a[0]; const w = where(id); if (!w) throw 0; srv[w] = srv[w].filter(x => x.id !== id); return {}; }
    if (name === "addCard") { const x = { id: nextCard++, title: a.slice(1).join(",") }; srv.todo.push(x); return { ...x }; }
    return null;
  };
  const step = (verb: string, k: string) => {
    const rs = fl[k] ?? []; if (!rs.length) { log("NOFLIGHT", k); return; } fl[k] = [];
    if (verb === "fail") { rs.forEach(([, j]) => j(new Error("declined"))); return; }
    let v: any; try { for (const _ of rs) v = answer(k); } catch { rs.forEach(([, j]) => j(new Error("declined"))); return; }
    rs.forEach(([r]) => r(structuredClone(v)));
  };

  const c = document.body.appendChild(document.createElement("div"));
  const sig = (col: Col) => createSignal<any>(() => ask("fetchCards:" + col), { loadingValue: null } as any);
  const [todoAns, setTodoAns] = sig("todo"), [doingAns] = sig("doing"), [doneAns] = sig("done");
  const anss = { todo: todoAns, doing: doingAns, done: doneAns };
  const seen = (col: Col) => () => { try { return anss[col](); } catch { return null; } };
  const S = { todo: seen("todo"), doing: seen("doing"), done: seen("done") };
  const mk = (col: Col) => createOptimisticStore<Row[]>(() => (S[col]() ?? []).map((x: any) => ({ id: x.id, title: x.title, adding: false })), [], { key: "id" } as any);
  const [todo, setTodo] = mk("todo"), [doing, setDoing] = mk("doing"), [done, setDone] = mk("done");
  const stores = { todo, doing, done }, sets = { todo: setTodo, doing: setDoing, done: setDone };
  const has = (cs: any[] | null, id: number) => cs != null && cs.some(x => x.id === id);
  const home = (id: number): Col => has(S.todo(), id) ? "todo" : has(S.doing(), id) ? "doing" : "done";
  const shownIn = (id: number): Col | "" => COLS.find(col => stores[col].some(r => r.id === id)) ?? "";
  const reask = (cols: Col[]) => { for (const col of new Set(cols)) refresh(anss[col]); };
  type Move = { id: number; from: Col; to: Col; index: number; row: Row };
  const without = (rs: Row[], id: number) => rs.filter(r => r.id !== id);
  const shifted = (rs: Row[], col: Col, m: Move) => col === m.to ? (r2 => [...r2.slice(0, m.index), m.row, ...r2.slice(m.index)])(col === m.from ? without(rs, m.id) : rs) : col === m.from ? without(rs, m.id) : rs;
  const move = action(function* (m: Move, from: Col) {
    for (const col of COLS) sets[col]((rs: Row[]) => shifted(rs, col, m));
    try { yield ask(`moveCard:${m.id},${m.to},${m.index}`); } catch { return; }
    reask([from, m.from, m.to, ...COLS.filter(col => has(latest(S[col]), m.id))]);
  });
  const rename = action(function* (i: number, id: number, t: string, col: Col, shown: Col) {
    sets[shown]((d: any) => { d[i].title = t; });
    try { yield ask(`renameCard:${id},${t}`); } catch { return; }
    reask([col, shown]);
  });
  const archive = action(function* (id: number, col: Col, shown: Col) {
    sets[shown]((rs: Row[]) => without(rs, id));
    try { yield ask(`archiveCard:${id}`); } catch { return; }
    reask([col, shown]);
  });
  const add = action(function* (key: number, title: string, at: number) {
    setTodo((d: any) => { d[at] = { id: key, title, adding: true }; });
    let r: any; try { r = yield ask(`addCard:todo,${title}`); } catch { return; }
    setTodoAns((cs: any) => cs == null || cs.some((x: any) => x.id === r.id) ? cs : [...cs, { id: r.id, title: r.title }]);
  });
  let selected: number | null = null, minted = 0;
  const clickMove = (id: number, to: Col | "", by: number) => {
    const sh = shownIn(id); if (!sh) return; const dest = to || sh; const rs = stores[sh];
    const index = to ? stores[to].length : rs.findIndex(r => r.id === id) + by;
    move({ id, from: sh, to: dest, index, row: rs.find(r => r.id === id)! }, home(id));
  };
  const LR: Record<Col, [Col | "", Col | ""]> = { todo: ["", "doing"], doing: ["todo", "done"], done: ["doing", ""] };

  const col = (rows: Row[]) => <ul><For each={rows}>{(r: any) => <li>{r.adding ? `(${r.title})` : `#${r.id} ${r.title}`}</li>}</For></ul>;
  render(() => <div>{col(todo)}{col(doing)}{col(done)}</div>, c);
  const state = () => [...c.querySelectorAll("ul")].map(u => [...u.querySelectorAll("li")].map(l => l.textContent).join(",")).join(" | ");
  for (const st of (process.env.TRAIL ?? "").split(";").map(s => s.trim()).filter(Boolean)) {
    const [verb, ...rest] = st.split(" "); const arg = rest.join(" ");
    if (verb === "land" || verb === "fail") step(verb, arg);
    else if (verb === "select") selected = +arg.slice(1);
    else if (verb === "left" || verb === "right") { const id = +arg.slice(1); const sh = shownIn(id); if (sh) { const to = LR[sh][verb === "left" ? 0 : 1]; if (to) clickMove(id, to, 0); } }
    else if (verb === "up" || verb === "down") clickMove(+arg.slice(1), "", verb === "up" ? -1 : 1);
    else if (verb === "rename") { const id = selected!; const sh = shownIn(id); if (sh) rename(stores[sh].findIndex(r => r.id === id), id, arg, home(id), sh); }
    else if (verb === "archive") { const id = selected!; const sh = shownIn(id); if (sh) { archive(id, home(id), sh); selected = null; } }
    else if (verb === "add") { if (S.todo() != null) add(-(++minted), arg, todo.length); }
    await tick();
    if (process.env.EVERY) log("STEP", st, "=>", state());
  }
  log("SCREEN", state()); log("SERVER", COLS.map(col => srv[col].map(x => `#${x.id} ${x.title}`).join(",")).join(" | ")); log("AIR", air().join(" "));
});
