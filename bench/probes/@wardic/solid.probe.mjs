import { DomLive } from "@wardic/dom";
export const probes = {
  WardicProvider: { props: () => ({ env: DomLive }) },
  createTransform: { args: () => [() => 1, n => n * 2] },
  createCycle: { args: () => ["a", "b"] },
  easeInOut: { args: () => [0.5] },
};
