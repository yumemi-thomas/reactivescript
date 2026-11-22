import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "@solid-primitives/devices", title: "the media devices as a list", ssr: false, server: "createDevices reads navigator.mediaDevices where it is called, with no server path (index.js: `navigator.mediaDevices.enumerateDevices()`): a .tsx app meets the same TypeError in its server render", dom: /\d+ devices/ });
