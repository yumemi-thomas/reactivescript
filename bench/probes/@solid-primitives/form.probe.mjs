export const probes = { createForm: { args: () => [{ fields: { name: { initial: "", validate: v => v ? null : "required" } } }] } };
