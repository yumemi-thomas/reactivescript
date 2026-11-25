export function watchPosition(ok, fail, options) { const id = navigator.geolocation.watchPosition((p) => ok(p.coords), fail, options); return () => navigator.geolocation.clearWatch(id); }
