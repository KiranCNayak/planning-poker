import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { initSocket } from "./modules/realtime/socket.js";
import { startPendingLeaveSweeper } from "./modules/realtime/pending-leave-sweeper.js";
import { redis } from "./lib/redis.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();
const server = http.createServer(app);
const io = initSocket(server);
startPendingLeaveSweeper(io.of("/room"), redis, prisma);

server.listen(env.PORT, () => {
	console.log(`backend listening on http://localhost:${env.PORT}`);
});
