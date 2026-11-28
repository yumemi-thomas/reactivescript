// a device that answers, or refuses as a browser does (its refusal is no Error; the library hands out one)
let down = false;
Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (ok, no) => setTimeout(() => down ? no({ code: 1, message: "denied" }) : ok({ coords: { latitude: 1 } }), 5) } });
export const probes = { createPosition: { args: () => [], fail: () => { down = true; return []; } } };
