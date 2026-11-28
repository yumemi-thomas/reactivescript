export const probes = { Toggle: { props: () => ({ onPressedChange: () => {} }), act: () => { [...document.querySelectorAll("[aria-pressed]")].at(-1).click(); } } };
