import { use } from "../../../cover.mjs";
export default use(import.meta, { pkg: "solid-use", modules: ["solid-use/client-only"], title: "a client-only part and the client signal", ssr: /on the server ?measuring/, dom: /in the browser ?measured/ });
