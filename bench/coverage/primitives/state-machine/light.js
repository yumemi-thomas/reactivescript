import { createMachine } from "@solid-primitives/state-machine";
export const createLight = () => createMachine({ initial: "off", states: { off: () => "dark", on: () => "bright" } });
