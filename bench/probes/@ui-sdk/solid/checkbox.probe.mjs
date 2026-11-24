export const probes = { Checkbox: { props: () => ({ onCheckedChange: () => {} }), act: () => { [...document.querySelectorAll("[role=checkbox]")].at(-1).click(); } } };
