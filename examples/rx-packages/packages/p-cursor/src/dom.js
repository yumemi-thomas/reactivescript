export const body = () => document.body;
/** The cursor set on an element, and put back as it was. */
export function setCursor(el, value) { const was = el.style.getPropertyValue("cursor"), p = el.style.getPropertyPriority("cursor"); el.style.setProperty("cursor", value, "important"); return () => { was ? el.style.setProperty("cursor", was, p) : el.style.removeProperty("cursor"); }; }
