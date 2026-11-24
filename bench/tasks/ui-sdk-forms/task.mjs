// UI SDK's form controls (09 MO-11a, MO-10g, MO-12, 02 SC-4, C-3a): components whose value the app holds and whose
// change callback writes it back (`handler`), a part that reads its group. Solid: `<Checkbox checked={accepted()}
// onCheckedChange={setAccepted}>`, `<RadioGroup value={speed()} onValueChange={setSpeed}>`. Not rendered on the server
// here: the package's default build is compiled for the DOM (bench/tasks/ui-sdk-dialog).
export default {
  title: "UI SDK: a checkbox and a radio group the app controls, a button its state enables",
  types: [
    { name: "the checkbox's change is the library's: checked, or indeterminate", edit: ['(checked: boolean | "indeterminate") => { accepted := checked == true }', "(checked: string) => { accepted := checked == \"yes\" }"], expect: /TS2322|TS2345|TS2769/ },
    { name: "the group's value is a string or null", edit: ["<RadioGroup value={speed}", "<RadioGroup value={sent}"], expect: /TS2322|TS2769/ },
    { name: "a prop the control has not", edit: ['<Button class="send" disabled={!accepted}', '<Button class="send" disable={!accepted}'], expect: /TS2322|TS2769|TS2353/ },
  ],
  bad: [
    { name: "a radio beside its group, not inside it", edit: ['    <label><Radio class="express" value="express"><RadioIndicator /></Radio> Express</label>\n  </RadioGroup>', '  </RadioGroup>\n  <label><Radio class="express" value="express"><RadioIndicator /></Radio> Express</label>'], expect: "CONTEXT_NOT_FOUND" },
    { name: "the change handler called where it is passed", edit: ['onCheckedChange={(checked: boolean | "indeterminate") => { accepted := checked == true }}', "onCheckedChange={accept()}"], edit2: ["  source sent: number := 0", "  source sent: number := 0\n  action accept() { accepted := true }"], expect: "ACTION_CALLED_IN_OWNED_SCOPE" },
    { name: "the state read after its own write, in the handler", edit: ["onClick={() => { sent := n => n + 1 }}", "onClick={() => { sent := n => n + 1; log(sent) }}"], expect: "STALE_OWN_READ" },
    { name: "the controlled value copied into a second source by an effect", edit: ["  source sent: number := 0", '  source sent: number := 0\n  source label: string := ""\n  effect (speed) { label := $0 ?? "none" }'], advise: "EFFECT_RELAY_TEAR" },
    { name: "the app's state written while the view computes", edit: ["disabled={!accepted}", "disabled={speed == null}"], edit2: ['<p class="state">', '<p class="state">{reset()}'], expect: "UNBOUND" },
    { name: "a part the library has not", edit: ["<CheckboxIndicator>x</CheckboxIndicator>", "<CheckboxMark>x</CheckboxMark>"], expect: "UNKNOWN_COMPONENT" },
  ],
  async run(h) {
    const base = await h.serve(); const page = await h.open(base);
    h.check("the button starts disabled by the app's state", await h.until(async () => (await page.isDisabled(".send"))), await page.getAttribute(".send", "disabled"));
    await page.click(".terms");
    h.check("the checkbox's change reaches the app's state", await h.until(async () => /^accepted, standard/.test(await h.text(page, ".state"))), await h.text(page, ".state"));
    await page.click(".express");
    h.check("the radio group's too", await h.until(async () => /accepted, express/.test(await h.text(page, ".state"))), await h.text(page, ".state"));
    await page.click(".send");
    h.check("the button, enabled now, is pressed", await h.until(async () => /sent 1/.test(await h.text(page, ".state"))), await h.text(page, ".state"));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
