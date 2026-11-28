import { createWorker } from "@solid-primitives/workers";
export const createSquarer = () => { const [worker] = createWorker({ square: function (n) { return n * n; } }); return { run: n => worker.square(n) }; };
