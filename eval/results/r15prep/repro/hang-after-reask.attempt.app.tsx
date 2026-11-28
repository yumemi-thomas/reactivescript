import { onFlush, createErrorBoundary, untrack, Show, For, Loading, Errored, action, createMemo, createSignal, createOptimistic, createProjection, refresh, isPending } from "solid-js";
import { fetchArchived, fetchCards, fetchChecklist, moveCard, renameCard, toggleItem } from "./api.js";

// root-owned state, as rxc lowers store.rx
const [visit, setVisit] = createSignal(0);
const [selected, setSelected] = createSignal<number | null>(null);
const col = (c: string) => createSignal<any>(() => (visit() >= 0 ? fetchCards(c) : null), { loadingValue: null } as any)[0];
const todoAns = col("todo"), doingAns = col("doing"), doneAns = col("done");
const checklistQ = createMemo<any>(() => (selected() != null ? fetchChecklist(selected()) : undefined));
const [checklist] = createSignal<any>(() => (selected() == null ? null : { card: selected(), items: checklistQ() }));
const guessList = () => { const [t] = createSignal<any[]>(() => []); return createOptimistic<any[]>(() => t()); };
const [moving, guessMoving] = guessList();
const [renaming, guessRenaming] = guessList();
const [toggling, guessToggling] = guessList();
const w = createMemo(() => ({ moving: moving(), renaming: renaming(), toggling: toggling() }));
const without = (cs: any[], id: number) => cs.filter(c => c.id !== id);
const step = (cs: any[], c: string, m: any) => m.col !== c ? without(cs, m.id) : [...without(cs, m.id).slice(0, m.index), cs.find(x => x.id === m.id) ?? m.card, ...without(cs, m.id).slice(m.index)];
const lay = (ans: any[] | null, c: string, w: any) => ans == null ? null : w.moving.reduce((cs: any[], m: any) => step(cs, c, m), ans).map((x: any, i: number, cs: any[]) => ({
  id: x.id, title: w.renaming.reduce((t: string, r: any) => r.id === x.id ? r.title : t, x.title),
  done: w.toggling.filter((t: any) => t.card === x.id).reduce((n: number, t: any) => n + (t.done ? 1 : -1), x.done), total: x.total, card: x, pos: i, last: i + 1 === cs.length }));
const todoRows = createMemo(() => lay(todoAns(), "todo", w()));
const doingRows = createMemo(() => lay(doingAns(), "doing", w()));
const doneRows = createMemo(() => lay(doneAns(), "done", w()));
const itemsSrc = createMemo(() => { const l = checklist(); return l == null ? [] : l.items.map((it: any) => ({ key: `i${it.id}`, id: it.id, text: it.text, done: toggling().reduce((d: boolean, t: any) => t.card === l.card && t.item === it.id ? t.done : d, it.done) })); });
const items = createProjection(() => itemsSrc() as any, [] as any, { key: "key" } as any) as any;

const reask = action(function* () { refresh(todoAns); refresh(doingAns); refresh(doneAns); });
const move = action(function* (card: any, c: string, index: number) {
  try { guessMoving(ms => [...ms, { id: card.id, col: c, index, card }]); yield moveCard(card.id, c, index); yield reask(); } catch {}
});
const rename = action(function* (id: number, title: string) {
  try { guessRenaming(rs => [...rs, { id, title }]); yield renameCard(id, title); yield reask(); } catch {}
});
const toggle = action(function* (card: number, item: number, done: boolean) {
  try { guessToggling(ts => [...ts, { card, item, done }]); yield toggleItem(card, item, done); refresh(checklistQ); refresh(checklist); yield reask(); } catch {}
});
const openBoard = action(function* () { setVisit(v => v + 1); setSelected(null); });
const select = action(function* (id: number) { setSelected(id); });

const colName = (c: string) => c === "todo" ? "To do" : c === "doing" ? "Doing" : "Done";
function Column(props: any) {
  return <section data-testid={`col-${props.col}`}>
    <Loading fallback={<><h2 data-testid={`head-${props.col}`}>{colName(props.col)}</h2><p>loading</p></>}>
      <h2 data-testid={`head-${props.col}`}>{colName(props.col)}{props.rows == null ? "" : ` (${props.rows.length})`}</h2>
      <Errored fallback={(e: any) => <p>error {String(e()?.message ?? e())}</p>}>
        <Show when={props.rows == null} fallback={<ul><For each={props.rows}>{(r: any) => <li>
          <button data-testid="card" onClick={() => props.onSelect(r.id)}>#{r.id} {r.title} · {r.done}/{r.total}</button>
          <Show when={props.left !== ""}>{" "}<button data-testid="left" disabled={!props.leftOk} onClick={() => props.onMove(r.card, props.left, props.leftSize)}>left</button></Show>
          <Show when={props.right !== ""}>{" "}<button data-testid="right" disabled={!props.rightOk} onClick={() => props.onMove(r.card, props.right, props.rightSize)}>right</button></Show>
        </li>}</For></ul>}><p>loading</p></Show>
      </Errored>
    </Loading>
  </section>;
}

function BoardPage() {
  const [titleInput, setTitleInput] = createSignal("");
  const [moveError, setMoveError] = createSignal("");
  const pick = action(function* (id: number) { setTitleInput(""); onFlush(() => setMoveError("")); select(id); });
  const moveTo = action(function* (c: any, to: string, i: number) { onFlush(() => setMoveError("")); move(c, to, i); });
  const shown = (ans: any, rows: any) => { const m = createMemo(() => (isPending(() => ans()) ? null : rows())); return untrack(() => createErrorBoundary(() => m(), () => null)) as any; };
  const todoShown = shown(todoAns, todoRows), doingShown = shown(doingAns, doingRows), doneShown = shown(doneAns, doneRows);
  const n = (s: any) => createMemo(() => (s() == null ? 0 : s().length));
  const todoN = n(todoShown), doingN = n(doingShown), doneN = n(doneShown);
  const todoUp = createMemo(() => todoShown() == null);
  const intoDoing = createMemo(() => doingShown() != null && doingN() < 3);
  const findIn = (rs: any, id: any) => (rs == null || id == null ? null : rs.find((r: any) => r.id === id) ?? null);
  const sel = createMemo(() => findIn(todoShown(), selected()) ?? findIn(doingShown(), selected()) ?? findIn(doneShown(), selected()));
  return <div>
    <Column col="todo" rows={todoRows()} left="" right="doing" leftOk={false} rightOk={intoDoing()} leftSize={0} rightSize={doingN()} onSelect={pick} onMove={moveTo} />
    <button data-testid="add-card" disabled={todoUp()}>add</button>
    <Column col="doing" rows={doingRows()} left="todo" right="done" leftOk={todoShown() != null} rightOk={doneShown() != null} leftSize={todoN()} rightSize={doneN()} onSelect={pick} onMove={moveTo} />
    <Column col="done" rows={doneRows()} left="doing" right="" leftOk={intoDoing()} rightOk={false} leftSize={doingN()} rightSize={0} onSelect={pick} onMove={moveTo} />
    <p>{moveError()}</p><section data-testid="detail">
      <Show when={selected() == null || sel() == null} fallback={<>
        <h2>#{sel()?.id} {sel()?.title}</h2>
        <input data-testid="title-input" value={titleInput()} onInput={e => setTitleInput(e.currentTarget.value)} />
        <button data-testid="rename" onClick={() => { const t = titleInput(); if (t) { onFlush(() => setTitleInput("")); rename(sel()!.id, t); } }}>rename</button>
        <div data-testid="checklist"><Loading on={selected()} fallback={<p>loading checklist</p>}><Errored fallback={<p>checklist error</p>}>
          <ul><For each={items}>{(it: any) => <li><span data-testid="item">[{it.done ? "x" : " "}] {it.text}</span>
            <button data-testid="toggle" onClick={() => toggle(sel()!.id, it.id, !it.done)}>toggle</button></li>}</For></ul>
          <p data-testid="progress">{items.filter((it: any) => it.done).length}/{items.length} done</p>
        </Errored></Loading></div>
      </>}><p>select a card</p></Show>
    </section>
  </div>;
}

const [avisit, setAvisit] = createSignal(-1);
const archived = createMemo<any>(() => (avisit() >= 0 ? fetchArchived() : []));
const openArchive = action(function* () { setAvisit(v => v + 1); });
function ArchivePage() {
  return <section data-testid="archived"><Loading fallback={<p>loading archive</p>}><Errored fallback={<p>archive error</p>}>
    <ul><For each={archived()}>{(a: any) => <li><span data-testid="archived-card">#{a.id} {a.title}</span></li>}</For></ul>
  </Errored></Loading></section>;
}

export default function App() {
  const [page, setPage] = createSignal("board");
  return <div>
    <button data-testid="tab-board" onClick={() => { if (page() !== "board") { openBoard(); setPage("board"); } }}>Board</button>
    <button data-testid="tab-archive" onClick={() => { if (page() !== "archive") { openArchive(); setPage("archive"); } }}>Archive</button>
    <Show when={page() === "board"} fallback={<ArchivePage />}><BoardPage /></Show>
  </div>;
}
