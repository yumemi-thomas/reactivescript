const later = ms => new Promise(r => setTimeout(r, ms));
export const probes = { after: { args: () => [1, () => {}], act: () => later(20) }, every: { args: () => [1, () => {}], run: stop => setTimeout(stop, 30), act: () => later(20) }, soon: { args: () => [() => {}], act: () => later(5) } };
