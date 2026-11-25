/** The socket's state as it changes, closing included. */
export function watchState(ws, f) {
  const open = () => f(1), closed = () => f(3), close = ws.close.bind(ws);
  ws.addEventListener("open", open); ws.addEventListener("close", closed); ws.close = (...a) => { close(...a); f(2); };
  return () => { ws.removeEventListener("open", open); ws.removeEventListener("close", closed); ws.close = close; };
}
export function watchMessage(ws, f) { const h = (e) => f(e.data); ws.addEventListener("message", h); return () => ws.removeEventListener("message", h); }
export const stateOf = (ws) => ws.readyState;
