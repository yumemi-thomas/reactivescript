// rx-verify's probe for primitives.d.rx: makePersisted takes a signal (MO-10h), as the compiler makes it.
import { createSignal } from "solid-js";
export const probes = { makePersisted: { args: () => [createSignal("light"), { name: "rx-verify-theme" }] } };
