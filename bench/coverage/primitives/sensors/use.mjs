import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/sensors", title: "a sensor's reading that may be absent", ssr: /battery: unknown/, dom: /battery: (unknown|[\d.]+)/ });
