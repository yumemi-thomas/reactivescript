# The words a tool writes: what proves each

`rx-declare` writes `pure`, `handler`, `instantiates`, `uses(c)`, `provides(c)` and the `ref` of a
part only shaped as an accessor. (`draft` and `rejects(E)` are a person's: none was proven over 205 modules of npm, 2026-11-26.) This is what reads the code for them. Two designs before it trusted the code and listed
shapes that are not safe; each list was found incomplete (2026-11-25: about 190 false words over 671 packages). This one
lists what is safe. **Whatever is not listed here gives no word**: a syntax, a value, a receiver, a method, a global, an API
of Solid's, a module. A missing word costs a question; a wrong one is a program accepted or refused falsely (MO-8v).

## What is read
- **Files.** A module is read as each host loads it: Node (`node import module-sync default`), Vite's client and server,
  each in development and production, each with and without Solid's `solid` condition. `resolve.rs` is Node's and Vite's
  resolution (exports, imports, main, module, a relative path and its extensions, a folder). Every other condition the
  package.json files of the graph ask about (`worker`, `deno`, `bun`, `react-server`, a name of the package's own) is read too,
  each with the others and without; one that names a file that is not there loads nothing. A word holds where it holds
  under every one of them. Under one that reaches a CommonJS file (from anywhere in the graph), a `browser` field that is not
  empty, a folder with a package.json, or a file that is not found, the module has no word. The draft's head says what was read; what `require` loads is not.
- **A built-in changed** (`patch.rs`). A file of the graph that writes a part of a built-in, or makes code of text (`eval`, `Function`, a
  timer given text, `.constructor("…")`), leaves no word anywhere. The write is one where its receiver is a built-in's, or the global
  object's under a built-in's name; a built-in that is put under a name, given to a function of the graph, answered by one, or taken off a
  namespace is followed there; one that goes further, beside any write that may be of one (its name a built-in member's, or computed, and
  its receiver not the code's own), is a change. *Assumed:* the global object, given to what is not followed, is written there under a computed
  name only in the module that has it.
- **A name** is known when its one declaration is its only write (oxc_semantic's references), so it stands for its first
  value.  `export *` from two modules that both have it is none.
- **A module's value** is a primitive, a function, a context, Solid's, a built-in's, the function a factory answers when it
  is run (by the reading below) as the module loads, or a *constant object*: a literal, a `Map`/`Set` of one, a pattern, which
  no export hands out, no function of which uses `this` (wherever it is written), and whose every reference is a read that does not let it go
  (`constant.rs`): so nothing that can reach it can write it. A class an export hands out is not one that is read: any importer may change it. `Object.freeze` of a literal of primitives and functions is one wherever it goes. A `const` that only names
  it is it, and a read of it may also be `find`, `some`, `every` or `map`,
  whose callback, written there, only reads its item; what `find` answers is only read too. Every other
  object of a module is not known, and neither is anything read from it. A function or a class is an object too: no
  property of one is read.

## The reading of a call (`eval.rs`)
An abstract run of the function, with what the row's types say of each argument (`types`, read through tsrs). A value is a
set of: a primitive; a value of the caller's, with its type; a function of the code with the names it closes over; an object
the call made; a built-in; one of Solid's; or something that may only be passed on and compared. An object the call made has
contents: whatever was put in it, at any time. Every statement is run whatever its condition says, again until nothing is
added; so is a function that calls itself. What is written through is an object or a name of this call: anything else ends
the reading. A method is looked up by the kind of its receiver (a primitive's, an array's of the call's or of a type that
is `lib`'s, a `Map`'s, a `Set`'s, a promise's) and its table says what it does with the receiver, its arguments and its
callback. `Object.create` and `new Proxy` answer a value that may only be passed on; `Object.assign` writes to an object of the
call's alone. An operator that converts takes primitives alone, and so does a key, a length, an entry's name. Iteration takes arrays, `Map`s and `Set`s.
An object's own names, a class's private ones and a list's places are three things. Of Solid's, the six functions below are values; what a
build decides (`isServer`, `isDev`, `DEV`) is a question of where it runs; anything else ends the reading.

**What the call answered.** Each function among it — a field's, an item's, a getter, what one of them answers in turn — is read as a call of its own,
with its parameters as the row's result types them, over what the call made as it was left: a name that is written again is state, a write is a change,
a read of an object that something may change later is not shown. An instance with methods, an iterator, a pattern, a proxy, a setter, a class is not
shown. What a timer, a promise's continuation, a computation that runs again, an effect, a cleanup, a store or a function that is not shown may
change is followed: an object of the answer that one of them reaches is *changed later*, and the fn is not `pure`.

## A line a word: proved, assumed
| word | proved | assumed |
| --- | --- | --- |
| `pure` | the reading of the call ends: it writes what it made, calls what is read, and asks no clock, chance, environment or owner; a function of the caller's is called at once, on primitives and the caller's own values, and only where the row shows one; every function it answers is shown to only compute and read (the last section), or the row is an instantiation and writes that part a function that answers nothing or a promise, which a view may not call (MO-10b); nothing of what it answers is changed later; nothing is scheduled but a promise's and a timer's continuation, itself read. It makes signals, memos and stores; effects only beside `instantiates`. Where a build or a test of the environment could change what it answers, it answers no data | MO-8j: "what a getter, a proxy or a callback among its arguments does is the caller's. A callback is a function where the row shows one that answers something (… a parameter, a field of a record parameter, a rest parameter's item)". An argument is of the row's type (13 TY-6) |
| `instantiates` | a statement of the body that no path can return without passing calls what Solid's development build reports without an owner: an effect, `onCleanup`, a boundary, `useContext` — itself, or through the body of a known function that is not async, the same way; in the browser's builds | MO-8l: "the call has no owner in a handler, an action, an effect's block or a server fn" |
| `uses(c)` | the same, of `useContext(C)`: `C` a context of the package made with no default, or with `null` and the next statements throw on it; and a `provides(c)` of the same draft | — |
| `provides(c)` | every return is a provider; `C` is provided above **every** view the component is given, each time with a value shown to be an object, a function or a primitive that is no false one; the props are named only as `props.x`, and one that may hold a view only among those children, in elements, fragments and providers (no value reads one) | — |
| `handler` | every reference to the callback is called, or handed on, where Solid's owner and observer are none whoever runs the code: a timer, a microtask, a promise of the language's, after an `await` no path passes by (an effect's second function is not one: `flush()` in an owned scope runs it there), an observer; or it is handed to the platform as a listener (next section). One such call at least | MO-10g: "as the DOM calls an event handler" |
| `ref` (a part) | every return hands out, there, what `createMemo` answers or a signal's getter, under a name never written | — |

## A listener (`target.rs`, `dispatch.rs`)
SC-4: "an event attribute in a view takes an imperative function". `<button onClick={() => { n := 1 }}>` is accepted by both checkers though
some code may call `el.click()` in a computation. Solid runs that handler there, and a library's `addEventListener` listener the same way:
with the owner and the observer of whoever dispatched; the development build refuses the write, the production build makes it (run 2026-11-26, solid-js 2.0.3, happy-dom and
Chromium, delegated or not). So a callback given to the platform as a listener has the standing of a JSX handler, **unless the library sends the event
itself while a call of it runs**. That is two proofs:
- **The receiver is the platform's** (`target.rs`): `window`, `document`, what the platform's accessors and finders answer from them, what its constructors
  make (not `XMLHttpRequest`, `AbortController`, `EventTarget`: those send while a call runs), or the caller's, where the row's type is lib's own
  interface (`t` in row-types.js; a `Pick`, an `Omit`, a type of the library's is none). A name is followed through calls by
  name, an effect's second function, a list's methods; a list or a record under a name is only ever read. (`el.onclick = cb` and an attribute `on…` of an intrinsic element are listeners; a spread, an
  element with a hyphen, a component are not.) What the caller's own target does when it is listened to is the caller's, as a getter's is (MO-8j).
- **Nothing the package loads sends it** (`dispatch.rs`): every function that the exports of **every entry the package has** and the loading code reach by name, in
  every module they load but Solid's (a file of the app's own: its own graph). What may be done is listed, not what may not: a member whose name is one of the platform's
  (`platform.txt`: lib.dom's, and Chromium's) may be called, taken or written only where this file lists it as one that sends nothing before it
  answers, or the object is one the code made itself; a global, a `new`, a function of Solid's, an attribute, the same. What sends only focus's
  events, moves elements, or loads a frame is none for a listener of other events, where their names are known. A place in a listener, in a timer or after an `await` is a place. A
  member whose name is computed is none of those, unless it is a number, a symbol, or read off an object of the code's own (or off what the program
  gave, where nothing puts it where it could be called). The global object may not go where more than its members are read; a class of the platform's, `Reflect`, `import()` and a module that is not read are not in the list.
- **The caller's target is the platform's**: where the package makes an object with a member whose name is computed (a proxy, `fromEntries`, a class's), it could type one as
  the platform's, and what the caller gives is not taken for one.

What only computes is what the ECMAScript text says of its own built-ins, unchanged: a *program* that replaces them
(`Array.prototype.map = …`) is every tool's to give up on; a file the import loads that does leaves no word. No other assumption is made.

## What each word costs where it is false, and what was added on 2026-11-28
The benchmark's declarations held 78 words written by hand that a correct program is refused without and the code did not
prove (bench/needed.txt: 38 `pure`, 25 `instantiates`, 10 `handler`, 4 `provides`, 1 `rejects`). Each group was read for a
rule that is general and sound; this is what was found, with what was run.

**`instantiates`: "on every path" is the word's meaning to a checker, not a margin.** Both checkers were run on rows with and
without it (2026-11-28): a row with the word is refused wherever nothing owns the call — a handler, an action, an effect's
block (`INSTANTIATION_NOT_BOUND`), and unbound in a view — and its value arguments are frozen (`SNAPSHOT_ARGUMENT`); a row
with neither it nor `pure` is refused in a component (`IO_IN_REACTIVE`). So the word is false of a fn one returning path of
which needs no owner: a call there is a correct program, and the word refuses it. The paths `place.rs` gives up on (a
loop, a `try`, a branch whose test it does not know) are given up on, not counted as passing. The 25 misses name 20 fns;
`probes/no-owner.mjs` calls each with no owner under Solid's development build in a DOM, with the controls beside them
(Solid reports an effect, a render effect, `onCleanup`, a context read; it reports no signal, memo, store or `onSettled`):
**19 run in silence, 1 throws** (`ward`, a context read; its code is another under each host and is no function written
out). The 19 guard their cleanup (`getOwner() ? onCleanup(f) : f`; production's `onCleanup` with no owner does nothing, run
too), make signals, stores or instances alone, or make nothing. No rule may write the word for them: `rx-verify` would
report each as a mismatch. The word that is true of such a fn is `pure` — the call only computes — with what it answers
that does something marked `io`; the two rules below write that where it was not written.
An owner test read as a test (`getOwner() ? … : …`) was tried and is not written: with `getOwner` taken as free
(unsound, to bound it) 8 rows more of 8,211 turn `pure`, and a test alone does not show that what such a fn answers is
the same wherever it was called (`createCallback` keeps the owner it found for later).

**A function a fn answers, in parentheses (`declare-infer.js`).** A whole result that is a function type is drafted in
parentheses, `((x: T) => U)`, and the `io` mark (09 MO-10b) was written only before a function type that began the text:
a fn whose own call only computes, and which answers one function not shown to only compute, lost `pure` for want of a
place to say so. The mark is now written before the parentheses too — whole result, tuple's item, record's field — where
both checkers read it (`io ((x: T) => U)`: `IO_IN_REACTIVE` in a view, accepted in a handler; `test/words.js`). *Sound:*
nothing is proven that was not: `pure` is the same reading of the fn's own call, and the function it answers is said to do
something, the notation's own word for *not shown to only compute* — it is never said to be a read. A function that may be
absent (`((x: T) => U) | undefined`) has no mark and the fn no `pure`, as before. Over the 281 modules of the census: 51
rows turn `pure`; over the adversarial packages 12 do, each of which answers a function that counts, ticks or sets.

**A result the module names, by its parts (`declare.js`).** 09 MO-8o: a result the library names is written by that name
unless its parts say what the checker reads. A type the module itself exports (`FilePicker`) kept its name even then, so no
part of it could carry `ref` or `io` and a call of a part that answers nothing was accepted in a view. It is now written a
step at a time, as a type of another module's is, where **the types alone** show a part the checker reads: an accessor
the library names one (Solid's `Accessor`), or a function that answers nothing or a promise; and where no part of it needs
an `any` of the draft's or is said by place. *Sound:* every part is the library's own type (the row is held to it, 13
TY-6), and no word is written off a shape: a part only shaped as an accessor (`() => T`) is no evidence and is the
function it is (valibot's `reference: () => Schema` keeps its schema's name), a `ref` is the types' `Accessor` as it is
for a whole result, and an unmarked function part says nothing more than its type. 41 rows of the census change (their
accessors are read as values, `picker.files`, as every drafted accessor is); 2 of them turn `pure`.

**The word `ref`, and a field of that name (`declare-infer.js`).** A row with a `ref` part instantiates (MO-10a), so its
`instantiates` is not written twice. The test took a record's field *named* `ref` (`{ ref: (el: T) => void }`) for the
word, and a proven `instantiates` was left off such a row. It reads the word alone now.

**What no sound rule covers** (the reasons `pure` is not proven, over the census's 8,211 rows; what stands in the way):
- *An object of the module that code may change or let go* (137 rows; `INTERNAL_OPTIONS`, which `@solid-primitives/utils`
  exports, alone stops 30, valibot's 33): whoever has it may write it, and what it holds is read by the call. A frozen
  literal is read already; nothing else shows that no one writes.
- *A context read* (93) is a hook: `instantiates` is proven, `pure` is not asked.
- *What the call answers is Solid's own, or is changed by a function beside it* (97, 85): a store's proxy, a schema whose
  `~run` and `reference` are functions under names a row cannot write. There is no part to mark.
- *An argument that may run code* (`toString`, a method that is not the language's, a value not shown to be a function or
  a list: 216): the row's type is `any`, a type parameter or an object of the library's; MO-8j gives the caller what its
  own getters do, not what a method the fn chooses to call does.
- *The app's own fetchers* (`pure fn fetchPerson(…) rejects(NotFound)`, 8 rows): they count in a global, wait on a timer
  and throw a class the module exports. `pure` there is the author's claim about a server's answer, and what a promise
  rejects with is not read (five false `rejects` were written when it was).
- `provides(c)`, and with it every `uses(c)` and context row (the largest part of the words written by hand in the
  tasks): a real provider hands its props to `merge` and `omit` and spreads what is left into a component of the
  library's (`Polymorphic`, a `rootScope(…)`), so whether a view it is given is rendered below the provider is that
  component's to show, and the one it renders. Following components is not done here: the third review found 16 false
  `provides` in the reading that tried.
- `handler` (10): the callback's record goes to the same `merge`, `omit` and spread (504 rows of the census), to a `.bind`
  of a function that is not known, or the package is not read (a built-in changed, a `umd` condition).

## Not read, each on purpose
`this` outside a class's own code; `arguments`; generators; `Date`; `Symbol()`; a getter, a setter, a spread of an object
that has one; `__proto__`, `prototype`, `constructor`; `.call`/`.apply`/`.bind`; tags; `import()`; `import.meta`; a class with
statics, accessors, decorators or a base but `Error`; enums and namespaces; a method row of an object the module exports
(any importer may change it); JSX in a `pure` fn; an object with a `handleEvent`; a component's props through a spread, a proxy, or a component that is not
Solid's provider; an object made when the module loads and changed later, whoever changes it.
