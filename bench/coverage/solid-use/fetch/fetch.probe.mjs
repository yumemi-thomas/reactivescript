let down = false;
globalThis.fetch = async () => { await new Promise(r => setTimeout(r, 5)); if (down) throw new Error("offline"); return new Response(JSON.stringify({ name: "a" })); };
export const probes = { createJson: { args: () => ["/j"], fail: () => { down = true; return ["/j"]; } } };
