import { use } from "../../../cover.mjs";
export default use(import.meta, { pkgs: [], title: "a state machine: its state read, its transition called from a handler", ssr: /the light is off, dark/, dom: async (h, page) => {
    await page.click("button");
    h.check("the handler's call is followed", await h.until(async () => /the light is on, bright/.test(await h.text(page))), await h.text(page));
  }, pkg: "@solid-primitives/state-machine", note: "a JS module of the app's own: the machine is one function that is an accessor of its state and has that state\'s fields too, with a state type computed from the record of states" });
