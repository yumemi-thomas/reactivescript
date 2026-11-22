// A Kobalte compound dialog (09 MO-11q, MO-12).
export default {
  title: "Kobalte: a controlled compound dialog",
  declare: { "@kobalte/core/dialog": ["--run", "--dom"] },   // how its .d.rx was drafted: the parts' context is found by running them
  types: [
    { name: "the root's props are Kobalte's own", edit: ["<Dialog open={open}", '<Dialog modal={"yes"} open={open}'], expect: /TS2322/ },
    { name: "onOpenChange's argument is a boolean", edit: ["open := next }", "open := next.length }"], expect: /TS2339|TS2322/ },
  ],
  bad: [
    { name: "a part outside its root", edit: ['<p class="count">removed {removed}</p>', '<p class="count">removed {removed}</p>\n  <Dialog.Trigger>stray</Dialog.Trigger>'], expect: "CONTEXT_NOT_FOUND" },
    { name: "a part the kit does not have", edit: ["<Dialog.Title>Remove the item?</Dialog.Title>", "<Dialog.Header>Remove the item?</Dialog.Header>"], expect: "UNKNOWN_COMPONENT" },
    { name: "the open state written while the view computes", edit: ['<Dialog.Description>This cannot be undone.</Dialog.Description>', '<Dialog.Description>{(() => { open := false })()}</Dialog.Description>'], expect: "REACTIVE_WRITE_IN_OWNED_SCOPE" },
    { name: "a write to derived state in the confirm", edit: ["removed := removed + 1; open := false", "removed := removed + 1; label := \"done\""], expect: "UNBOUND" },
    { name: "the confirm reads its own write back (the count it just wrote)", edit: ["removed := removed + 1; open := false", "removed := removed + 1; open := removed > 3"], expect: "STALE_OWN_READ" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("mounted, closed", await h.until(async () => /removed 0/.test(await h.text(page, "body")) && !/cannot be undone/.test(await h.text(page, "body"))), await h.text(page, "body"));
    await page.click(".trigger");
    h.check("the trigger opens it, through the app's source (role=dialog, in a portal)", await h.until(async () => /cannot be undone/.test(await h.text(page, "body")) && await page.locator("[role=dialog]").count() === 1), await h.text(page, "body"));
    await page.click(".confirm");
    h.check("the confirm writes app state and closes it", await h.until(async () => /removed 1/.test(await h.text(page, "body")) && !/cannot be undone/.test(await h.text(page, "body"))), await h.text(page, "body"));
    await page.click(".trigger"); await h.until(async () => await page.locator("[role=dialog]").count() === 1);
    await page.click(".close");
    h.check("the close button closes it, the count as it was", await h.until(async () => /removed 1/.test(await h.text(page, "body")) && !/cannot be undone/.test(await h.text(page, "body"))), await h.text(page, "body"));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
