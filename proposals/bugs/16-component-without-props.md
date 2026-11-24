# A component that declares no props is typed as one that takes `any`

A library that asks for a function of nothing is refused it.

<!-- tsx branch=ok upstream=TS2345 -->
```rx
export component Saved() { <p>saved</p> }
export default component App() { <Saved /> }
-- file: ./use.ts
import { Saved } from "./main.rx";
declare function toast(view: () => unknown): void;
toast(Saved);
```

**On upstream (e650b85).** `TS2345: Argument of type '(props: any) => Element' is not assignable to parameter of type '() => unknown'`.

**Spec.** 13 TY-3. RG-4b already says that `props` is not bound there.

**Cause.** The projection writes `props: any`.

**Fix in this branch.** 907b5a8 (13 TY-3d): a function of nothing. An attribute given to it is then TypeScript's to refuse.

**Test.** `npm run types`; `bench/coverage/solid-sonner`.
