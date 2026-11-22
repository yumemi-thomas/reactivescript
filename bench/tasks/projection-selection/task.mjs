// A selection as a projection (06 ST-3). Solid 2: `createProjection(draft => { draft[selectedId()] = true; … }, {})`,
// read per row as `selected[row.id]` — and the mistake it replaces: the same record kept in a store by an effect.
const rows = async page => (await page.locator("li").evaluateAll(ls => ls.map(l => `${l.className}${l.dataset.renders}`))).join(" ");
export default {
  title: "A selection as a projection: picking a row tells two rows, not every row",
  types: [
    { name: "the picked id is a number where a row writes it", edit: ["onPick={() => { picked := mail.id }}", "onPick={() => { picked := mail.subject }}"], expect: /TS2322|TS2345/ },
    { name: "a row's props keep their types", edit: ["on={selected[str(mail.id)] == true}", "on={mail.subject}"], expect: /TS2322/ },
  ],
  bad: [
    { name: "the selection kept in a store, written by an effect on the picked id", edit: ["selected: Record<string, boolean> = draft(pre selected -> {}) { d[str(pre picked -> 0)] := false; d[str(picked)] := true }", "source selected: Record<string, boolean> := {}\n  effect (picked) { selected := {}; selected[str($0)] := true }"], expect: "EFFECT_RELAY_TEAR" },
    { name: "…by a mount effect that reads the picked id: the first row stays selected for ever", edit: ["selected: Record<string, boolean> = draft(pre selected -> {}) { d[str(pre picked -> 0)] := false; d[str(picked)] := true }", "source selected: Record<string, boolean> := {}\n  effect () { selected[str(picked)] := true }"], expect: "EFFECT_RELAY_TEAR" },
    { name: "the projection's draft written from a handler", edit: ["onPick={() => { picked := mail.id }}", "onPick={() => { selected[str(mail.id)] := true }}"], expect: "WRITE_TO_NON_SOURCE" },
    { name: "the projection writing something that is not its draft", edit: ["d[str(picked)] := true }", "d[str(picked)] := true; picked := 2 }"], expect: "DRAFT_WRITE_OUTSIDE_DRAFT" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("mounted: the first row selected, each row's effect run once", await h.until(async () => (await rows(page)) === "on1 off1 off1 off1"), await rows(page));
    await page.click("li >> nth=2");
    h.check("picking a row: the row left and the row picked are told, the other two are not", await h.until(async () => (await rows(page)) === "off2 off1 on2 off1") && /picked 3/.test(await h.text(page)), `${await rows(page)} / ${await h.text(page, ".picked")}`);
    await page.click("li >> nth=3");
    h.check("and again", await h.until(async () => (await rows(page)) === "off2 off1 off3 on2"), await rows(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
