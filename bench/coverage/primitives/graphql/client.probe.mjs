let down = false;
globalThis.fetch = async () => { await new Promise(r => setTimeout(r, 5)); return new Response(JSON.stringify(down ? { errors: [{ message: "no" }] } : { data: { hello: "hi" } })); };
export const probes = { createGreeting: { args: () => ["/graphql"], fail: () => { down = true; return ["/graphql"]; } } };
