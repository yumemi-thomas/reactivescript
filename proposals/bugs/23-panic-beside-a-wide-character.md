# The crate panics on a parse error beside a character of several bytes

<!-- check branch=PARSE upstream=failed says-upstream="is not a char boundary" -->
```rx
x = "é
```

**On upstream (e650b85).** `thread 'main' panicked at src/parse.rs:280:43: end byte index 6 is not a char boundary`. In an editor the language server's module traps: no diagnostics. A `.d.rx` row does it too: `ref number 😀uses(client)`.

**Spec.** 07: a parse error, as the reference gives.

**Cause.** `hint` reads the line the error is on. Where nothing is left of it, it steps one *byte* back from the last character. A declaration's word was cut out one byte after the match.

**Fix in this branch.** The offset of the last character; the word's own place in the match.

**What a search found.** Every program of the repository, with é, 漢, 😀, a combining mark, BOM, NBSP, U+2028, CRLF at token boundaries, or cut short: about 155,000 cases, the crate beside the reference. No other panic. Of white space that JavaScript has and Rust has not (U+FEFF), or the other way (U+0085), nine kinds of cases were read differently: the crate's patterns and trims are JavaScript's now. Columns, spans and source maps hold. The reference looped without end on `<b>}`; it refuses it, as the crate does. And [bug 24](24-open-block-in-an-editor.md).

**Not changed.** A file that begins with a BOM is refused, by both, in both trees.

**Test.** Unit tests in `parse.rs`; `ref/crate.ts --text`.
