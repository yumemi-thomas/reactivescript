// the layout is read first, so that what the element was is what it changes from
export const frame = f => { document.body.offsetHeight; const id = requestAnimationFrame(f); return () => cancelAnimationFrame(id); };
export const bound = (generation, done) => e => { if (!(e && e.currentTarget && e.target !== e.currentTarget)) done(generation); };
