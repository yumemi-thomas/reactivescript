# A name that is a word of the language can be declared and not written

<!-- check branch=ok upstream=ASSIGNMENT -->
```rx
export default component App() {
  source on := false
  <button onClick={() => { on := !on }}>{on}</button>
}
```

**On upstream (e650b85).** `.rx has no = on state`, at a write that has none. The same of other words (`effect`, `fallback`, `refresh`, `provide`, `try`, and more); `on` opens `loading on`.

**Spec.** 07 §2 reserves no word. The declaration is accepted, and the read.

**Cause.** A statement that begins with a word of the language is not tried as a write.

**Fix in this branch.** A word right before `:=` (or a path of it) is the name that is written: no statement has `:=` there. Both parsers.

**Not changed.** A name that cannot be read (`latest`, `await`, `if`) is refused where it is read.

**Test.** S-surface-12.
