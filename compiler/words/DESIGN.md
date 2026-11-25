# The words a tool writes: what proves each

`rx-declare` writes `pure`, `handler`, `draft`, `rejects(E)`, `instantiates`, `uses(c)`, `provides(c)` and the `ref` of a
part only shaped as an accessor. This is what reads the code for them. Two designs before it trusted the code and listed
shapes that are not safe; each list was found incomplete (2026-11-25: about 190 false words over 671 packages). This one
lists what is safe. **Whatever is not listed here gives no word**: a syntax, a value, a receiver, a method, a global, an API
of Solid's, a module. A missing word costs a question; a wrong one is a program accepted or refused falsely (MO-8v).

## What is read
- **Files.** A module is read as each host loads it: Node (`node import module-sync default`), Vite's client and server,
  each in development and production, each with and without Solid's `solid` condition. `resolve.rs` is Node's and Vite's
  resolution (exports, imports, main, module, a relative path and its extensions, a folder). A word holds where it holds
  under every one of them. Under one that reaches a CommonJS file, a `browser` field that is not empty, a folder with a
  package.json, or a file that is not found, the module has no word; an import *inside* it that is so reached is an unknown.
- **A name** is known when its one declaration is its only write (oxc_semantic's references), so it stands for its first
  value. A module with a direct `eval` or a `with` has no words. `export *` from two modules that both have it is none.
- **A module's value** is a primitive, a function, a context, Solid's, a built-in's, the function a factory answers when it
  is run (by the reading below) as the module loads, or a *constant object*: a literal, a `Map`/`Set` of one, a pattern, which
  no export hands out and whose every reference is a read that does not let it go (`constant.rs`): so nothing that can
  reach it can write it. `Object.freeze` of a literal of primitives and functions is one wherever it goes. A `const` that only names
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
call's alone. An operator that converts takes primitives alone. Iteration takes arrays, `Map`s and `Set`s.

## A line a word: proved, assumed
| word | proved | assumed |
| --- | --- | --- |
| `pure` | the reading of the call ends: it writes what it made, calls what is read, and asks no clock, chance, environment or owner; a function of the caller's is called at once, on primitives and the caller's own values, and only where the row shows one; nothing is scheduled but a promise's and a timer's continuation, itself read. It makes signals, memos and stores; effects only beside `instantiates`. Where a build or a test of the environment could change what it answers, it answers no data | MO-8j: "what a getter, a proxy or a callback among its arguments does is the caller's. A callback is a function where the row shows one that answers something (… a parameter, a field of a record parameter, a rest parameter's item)". An argument is of the row's type (13 TY-6) |
| `rejects(E)` | the reading of the call ends, it is async or answers a promise made there, and every throw and rejection it reaches is `new E` of a class the module exports whose construction is read; no callback of the caller's and no built-in that throws is reached | 04 R-f-10: what the engine raises for a bug is a panic |
| `instantiates` | a statement of the body that no path can return without passing calls what Solid's development build reports without an owner: an effect, `onCleanup`, a boundary, `useContext` — itself, or through a known function's body the same way; in the browser's builds | MO-8l: "the call has no owner in a handler, an action, an effect's block or a server fn" |
| `uses(c)` | the same, of `useContext(C)`: `C` a context of the package made with no default, or with `null` and the next statements throw on it; and a `provides(c)` of the same draft | — |
| `provides(c)` | every return is `C`'s provider; the props are named only as `props.x`, and one that may hold a view only among that provider's children, in elements, fragments and providers | — |
| `handler` | every reference to the callback is called, or handed on, where Solid's owner and observer are none whoever runs the code: a timer, a microtask, a promise of the language's, after an `await` no path passes by (an effect's second function is not one: `flush()` in an owned scope runs it there), an observer; or it is handed to the platform as a listener (next section). One such call at least | MO-10g: "as the DOM calls an event handler" |
| `draft` | a write of the parameter that no path returns without; every reference to it is such a write (of primitives) or a read of a primitive | — |
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
- **Nothing the import loads sends it** (`dispatch.rs`): every function that the import's exports and the loading code reach by name, in every module it loads but
  Solid's. The methods of lib.dom that send an event before they answer are listed (the rest were read: they queue, or send none), with what sends only focus's events and what
  moves elements; a place is none where it only runs later (a timer, a listener, after an `await`), or cannot send the events listened to, where
  their names are known. Whatever could reach such a method under no name of its own counts as one: a computed call, a method taken off its object and
  called with another `this`, `Reflect`, a prototype as a table, code made of text, a module that is not read. So does a method named `addEventListener`, or the platform's own replaced.

What only computes is what the ECMAScript text says of its own built-ins, unchanged: a program that replaces them
(`Array.prototype.map = …`) is every tool's to give up on. No other assumption is made.

## Not read, each on purpose
`this` outside a class's own code; `arguments`; generators; `Date`; `Symbol()`; a getter, a setter, a spread of an object
that has one; `__proto__`, `prototype`, `constructor`; `.call`/`.apply`/`.bind`; tags; `import()`; `import.meta`; a class with
statics, accessors, decorators or a base but `Error`; enums and namespaces; a method row of an object the module exports
(any importer may change it); JSX in a `pure` fn; an object with a `handleEvent`; a component's props through a spread, a proxy, or a component that is not
Solid's provider; an object made when the module loads and changed later, whoever changes it.
