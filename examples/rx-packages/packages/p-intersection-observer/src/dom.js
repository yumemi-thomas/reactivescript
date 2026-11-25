export function observe(el, options, f) { const io = new IntersectionObserver((es) => { for (const e of es) f(e.isIntersecting); }, options); io.observe(el); return () => io.disconnect(); }
