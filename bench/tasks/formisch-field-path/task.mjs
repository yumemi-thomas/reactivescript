// A typed Formisch field path (RFC 23, 13 TY-1; 09 MO-11k for the render prop).
export default {
  title: "Formisch: a form whose fields are named by typed paths",
  types: [
    { name: "a path the schema does not have is refused", edit: ['path={["email"]}', 'path={["emial"]}'], expect: /TS2322/ },
    { name: "a nested path is typed through the schema", edit: ['path={["profile", "name"]}', 'path={["profile", "nmae"]}'], expect: /TS2322/ },
    { name: "the field's input is the schema's type at that path: a string", edit: ['<input class="name" {...field.props} value={field.input ?? ""} />', '<input class="name" {...field.props} value={(field.input ?? "").toFixed(2)} />'], expect: /TS2339|TS2551/ },
    { name: "the submit's output is the schema's output", edit: ["${output.profile.name} <${output.email}>", "${output.profile.nmae} <${output.email}>"], expect: /TS2339|TS2551/ },
  ],
  bad: [
    { name: "the form made from a schema that reads a source: read once, then stale", edit: ["form = createForm({ schema: schema })", "form = createForm({ schema: object({ email: pipe(string(), minLength(len(signedIn))) }) })"], expect: "SNAPSHOT_ARGUMENT" },
    { name: "the form made where the view reads it, again on every change", edit: ["<Form of={form} onSubmit", "<Form of={createForm({ schema: schema })} onSubmit"], expect: "INSTANTIATION_NOT_BOUND" },
    { name: "state written while the view computes, not from a handler", edit: ['<p class="who">signed in: {signedIn}</p>', '<p class="who">signed in: {signedIn := "x"}</p>'], expect: "PARSE" },
    { name: "the submit's state assigned with `=`", edit: ["signedIn := `${output.profile.name} <${output.email}>`", "signedIn = output.email"], expect: "ASSIGNMENT" },
  ],
  async run(h) {
    const base = await h.serve();
    const page = await h.open(base);
    h.check("mounted", await h.until(async () => (await h.text(page)).includes("Sign in")), await h.text(page));
    await page.click(".submit");
    h.check("an empty submit shows the schema's messages at each path", await h.until(async () => /Enter a valid email/.test(await h.text(page)) && /At least 2 characters/.test(await h.text(page))), await h.text(page));
    await page.fill(".email", "ann@example.com"); await page.fill(".name", "Ann"); await page.click(".submit");
    h.check("a valid submit writes the .rx source with the typed output", await h.until(async () => (await h.text(page)).includes("signed in: Ann <ann@example.com>")), await h.text(page));
    h.check("no console errors or warnings", h.problems.length === 0, h.problems);
  },
};
