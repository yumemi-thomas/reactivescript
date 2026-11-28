import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a control component the library makes, given a change handler", ssr: false, server: "the control is the library's JSX, compiled for the DOM alone (one build): it calls a client-only API of @solidjs/web on the server, in any app", dom: async (h, page) => {
    await page.fill("input", "edited");
    h.check("the control's change reaches the handler", await h.until(async () => /edited/.test(await h.text(page, "h1"))), await h.text(page));
  }, pkg: "@solid-primitives/controlled-props", note: "a JS module of the app's own: createControlledProp hands back a component as a part of a tuple, and a component is rendered by its own name" });
