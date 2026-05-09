import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initSocket } from "./modules/realtime/socket.js";

const app = createApp();
const server = http.createServer(app);
initSocket(server);

server.listen(env.PORT, () => {
	console.log(`backend listening on http://localhost:${env.PORT}`);
});
