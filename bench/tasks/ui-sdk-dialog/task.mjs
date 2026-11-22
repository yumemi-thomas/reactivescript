// UI SDK for Solid (Vercel Labs; 09 MO-11, MO-12, MO-10g): a controlled dialog — its parts flat exports that find their root
// through a context the module keeps to itself — a change callback that is handed the library's details and may cancel
// the change, and a part whose child is a function of the part's state. Solid: `<Dialog open={open()}
// onOpenChange={(next, details) => …}>`, `<Toggle pressed={on()} onPressedChange={setOn}>{(state) => …}</Toggle>`.
// Not rendered on the server here: the package's default build is compiled for the DOM, and its server render is the
// `solid` condition's source, compiled by the app's bundler — this suite imports a package as Node resolves it.
const body = (h, page) => h.text(page, "body");
const isOpen = page => page.evaluate(() => { const c = document.querySelector("[data-slot=dialog-content]"); return !!c && c.hasAttribute("data-open") && c.getBoundingClientRect().height > 0; });
const drive = async (h, page) => {
  h.check(`closed, nothing sent`, await h.until(async () => /idle; sent 0/.test(await body(h, page)) && !(await isOpen(page))), await body(h, page));
  await page.click(".trigger");
  h.check(`the trigger opens it, through the app's source`, await h.until(async () => /sharing; sent 0/.test(await body(h, page)) && await isOpen(page) && (await page.locator("[role=dialog]").count()) === 1), await body(h, page));
  await page.mouse.click(5, 5);
  await new Promise(r => setTimeout(r, 150));
  h.check(`a press outside is cancelled by the app's callback (the library's details)`, /sharing/.test(await body(h, page)) && await isOpen(page), await body(h, page));
  h.check(`the toggle's child is a function of its state`, /Notify people: off/.test(await h.text(page, ".notify")), await h.text(page, ".notify"));
  await page.click(".notify");
  h.check(`pressing it writes the app's source, and its label follows`, await h.until(async () => /Notify people: on/.test(await h.text(page, ".notify")) && /with a notice/.test(await h.text(page, ".status")) && (await page.getAttribute(".notify", "aria-pressed")) === "true"), await body(h, page));
  await page.click(".send");
  h.check(`sending writes app state and closes it`, await h.until(async () => /idle; sent 1, with a notice/.test(await h.text(page, ".status")) && !(await isOpen(page))), await body(h, page));
  await page.click(".trigger"); await h.until(() => isOpen(page));
  await page.click(".close");
  h.check(`the library's close part closes it, the count as it was`, await h.until(async () => /idle; sent 1/.test(await h.text(page, ".status")) && !(await isOpen(page))), await body(h, page));
  await page.click(".trigger"); await h.until(() => isOpen(page));
  await page.keyboard.press("Escape");
  h.check(`Escape is not a press outside: it closes`, await h.until(async () => /idle/.test(await h.text(page, ".status")) && !(await isOpen(page))), await body(h, page));
};
export default {
  title: "UI SDK: a controlled dialog, a change the app cancels, a part whose child is a function of its state",
  types: [
    { name: "the root's props are the library's own", edit: ["<Dialog open={open}", '<Dialog open={"yes"}'], expect: /TS2322|TS2769/ },
    { name: "the change's details are the library's: a reason it has not", edit: ['details.reason == "outside-press"', 'details.reason == "outside-pres"'], expect: /TS2367|TS2322/ },
    { name: "the state a part hands its child is the library's", edit: ['state.pressed ? "Notify people: on"', 'state.presed ? "Notify people: on"'], expect: /TS2339|TS2551/ },
    { name: "onPressedChange's argument is a boolean", edit: ["notify := pressed }", "notify := pressed.length }"], expect: /TS2339|TS2322/ },
  ],
  bad: [
    { name: "a part outside its root", edit: ['  <p class="status">', '  <DialogClose>stray</DialogClose>\n  <p class="status">'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a part the library does not have", edit: ["<DialogTitle>Share link</DialogTitle>", "<DialogHeader>Share link</DialogHeader>"], expect: "UNKNOWN_COMPONENT" },
    { name: "the open state written while the view computes", edit: ["<DialogDescription>Anyone who has this link can view this.</DialogDescription>", "<DialogDescription>{(() => { open := false })()}</DialogDescription>"], expect: "REACTIVE_WRITE_IN_OWNED_SCOPE" },
    { name: "the state written from the function of state, which the part calls while it renders", edit: ['<span>{state.pressed ? "Notify people: on" : "Notify people: off"}</span>', '<span>{(() => { notify := state.pressed })()}</span>'], expect: "REACTIVE_WRITE_IN_OWNED_SCOPE" },
    { name: "the handler called where it is passed", edit: ["onPressedChange={(pressed: boolean) => { notify := pressed }}", "onPressedChange={flip(true)}"], edit2: ["  source sent: number := 0", "  source sent: number := 0\n  action flip(pressed: boolean) { notify := pressed }"], expect: "ACTION_CALLED_IN_OWNED_SCOPE" },
    { name: "the send reads its own write back (the count it just wrote)", edit: ["sent := sent + 1; open := false", "sent := sent + 1; open := sent > 3"], expect: "STALE_OWN_READ" },
    { name: "the controlled state copied into a second source by an effect", edit: ["  source sent: number := 0", "  source sent: number := 0\n  source wasOpen: boolean := false\n  effect (open) { wasOpen := $0 }"], expect: "EFFECT_RELAY_TEAR" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    await drive(h, page);
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
