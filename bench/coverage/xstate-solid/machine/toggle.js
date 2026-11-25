import { useMachine } from "@xstate/solid";
import { createMachine, createActor } from "xstate";
const machine = createMachine({ id: "toggle", initial: "off", states: { off: { on: { flip: { target: "on" } } }, on: { on: { flip: { target: "off" } } } } });
/** The machine, run by the component that calls it. */
export function toggle() {
  const [snapshot, send] = useMachine(() => createActor(machine));
  return { state: () => String(snapshot.value), send: type => send({ type }) };
}
