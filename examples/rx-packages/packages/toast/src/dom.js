let seq = 0;
/** An id for a toast, known before it is shown. */
export const nextId = () => ++seq;
export const measure = (e) => e.getBoundingClientRect().height;
