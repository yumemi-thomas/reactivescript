import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/timer", title: "a polled value: a pure function the library calls on a timer", ssr: /tick \d+/, dom: /tick ([3-9]|\d\d)/ });
