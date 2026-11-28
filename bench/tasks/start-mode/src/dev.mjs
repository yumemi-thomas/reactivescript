// node dev.mjs: the dev server (`npx vite`), its port printed. In start mode it renders each request itself: there is no
// server file. The watcher polls: what is tested is what an edit does to the page, not the platform's file events.
import { createServer } from "vite";
const server = await createServer({ logLevel: "silent", server: { host: "127.0.0.1", port: 0, watch: { usePolling: true, interval: 50 } } });
await server.listen();
console.log(`listening ${server.httpServer.address().port}`);
