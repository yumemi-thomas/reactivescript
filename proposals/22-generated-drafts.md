# 22 — Drafted declarations, for a person to review (tooling)

Needs [03](03-declaration-lookup.md).

## Proposal, in two steps

1. **From types alone.** `rx-declare <module>` drafts rows from TypeScript types: components, `ref` where a type says `Accessor`, and no other word. A `// TODO` for each thing the checkers would ask. A person reviews it.
2. **Words read from the code**, marked as read. `pure` is an assertion (CN-5), and a tool's reading of it is a suggestion.

## What a reading of `pure` is, and is not

`twice(o) { return o.a + o.a }` has code that only computes. `{ a: number }` also allows a getter, and a getter runs. So a reading can be of **the function's own code** and no more; what a getter, a proxy or a callback among
its arguments does is the caller's:

<!-- tool branch=ok upstream=- tool=declare args=./kit.js,--why says-branch="pure proven — its own code only computes" -->
```text
export default component App() { <p>a</p> }
-- file: ./kit.js
export function twice(o) { return o.a + o.a; }
-- file: ./kit.d.ts
export declare function twice(o: { a: number }): number;
```

A row `pure` in a generated file grants permission to call the function in a view. For that reason a generated file should not have it without a person's assertion: **step 2 is for drafts a person reviews.** The prototype does write it in generated files; that is not proposed.

## Evidence (author-selected)

193 modules of 104 packages drafted whole, 5,111 rows, 1,659 words, 660 questions left. 10,967 uses and programs are read again with a generated file: none is newly refused without a reason. Those are checks the author chose.

## Cost

Drafting 1,917 lines; the reading of code 2,054 (`infer.js`), for `pure` mostly. Step 1 alone needs none of the second.

## Prototype

MO-8l, n, v, w (proposed ids); `tooling/rx-language-server/DECLARATIONS.md`.
