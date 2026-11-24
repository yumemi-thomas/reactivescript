export const probes = { Button: { props: () => ({ onPress: () => {} }), act: () => { for (const b of document.querySelectorAll("button.button")) b.click(); } } };
