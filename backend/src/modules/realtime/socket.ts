import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";

const VOTE_VALUES = new Set([
	"1",
	"2",
	"3",
	"5",
	"8",
	"13",
	"21",
	"34",
	"55",
	"89",
	"?",
	"☕",
]);

export const initSocket = (httpServer: HttpServer) => {
	const io = new Server(httpServer, {
		cors: { origin: env.CORS_ORIGIN, credentials: true },
	});

	const nsp = io.of("/room");

	nsp.on("connection", (socket) => {
		socket.on(
			"room:join",
			async ({ shortCode, identityKey, displayName }) => {
				const room = await prisma.room.findUnique({
					where: { shortCode },
				});
				if (!room || !room.isActive) return socket.emit("room:expired");

				const ban = await prisma.roomBan.findFirst({
					where: {
						roomId: room.id,
						identityKey,
						liftedAt: null,
						OR: [
							{ expiresAt: null },
							{ expiresAt: { gt: new Date() } },
						],
					},
				});

				if (ban)
					return socket.emit("room:banned", {
						reason: ban.reason,
						expires_at: ban.expiresAt,
					});

				const activeCount = await prisma.roomSession.count({
					where: { roomId: room.id, leftAt: null },
				});
				if (activeCount >= room.capacity)
					return socket.emit("room:capacity_exceeded");

				const existing = await prisma.roomSession.findFirst({
					where: { roomId: room.id, identityKey },
				});
				const isReconnect = !!existing && !existing.leftAt;

				if (existing) {
					await prisma.roomSession.update({
						where: { id: existing.id },
						data: {
							leftAt: null,
							lastSeenAt: new Date(),
							displayName:
								displayName ?? existing.displayName ?? "user",
						},
					});
				} else {
					await prisma.roomSession.create({
						data: {
							roomId: room.id,
							identityKey,
							displayName: displayName ?? "user",
							joinedAt: new Date(),
							lastSeenAt: new Date(),
						},
					});
				}

				await prisma.roomParticipantHistory.create({
					data: {
						roomId: room.id,
						identityKey,
						displayName: displayName ?? "user",
						eventType: "join",
					},
				});

				socket.join(room.id);
				socket.data = { roomId: room.id, identityKey };
				nsp.to(room.id).emit("user:joined", {
					user_id: identityKey,
					display_name: displayName ?? "user",
				});
				socket.emit("room:state_sync", {
					roomId: room.id,
					is_reconnect: isReconnect,
				});
			},
		);

		socket.on("room:vote", async ({ value }) => {
			const { roomId, identityKey } = socket.data as {
				roomId?: string;
				identityKey?: string;
			};
			if (!roomId || !identityKey) return;
			if (!VOTE_VALUES.has(String(value))) return;

			await prisma.roomSession.updateMany({
				where: { roomId, identityKey, leftAt: null },
				data: { currentVote: String(value), lastSeenAt: new Date() },
			});

			nsp.to(roomId).emit("user:voted", { user_id: identityKey });
		});

		socket.on("room:reveal", async () => {
			const { roomId } = socket.data as { roomId?: string };
			if (!roomId) return;
			const sessions = await prisma.roomSession.findMany({
				where: { roomId, leftAt: null },
			});
			const votes: Record<string, string> = {};
			for (const s of sessions) {
				if (s.currentVote) votes[s.identityKey] = s.currentVote;
			}
			await prisma.room.update({
				where: { id: roomId },
				data: { votesRevealed: true, lastActivityAt: new Date() },
			});
			nsp.to(roomId).emit("room:votes_revealed", { votes });
		});

		socket.on("room:hide", async () => {
			const { roomId } = socket.data as { roomId?: string };
			if (!roomId) return;
			await prisma.room.update({
				where: { id: roomId },
				data: { votesRevealed: false, lastActivityAt: new Date() },
			});
			nsp.to(roomId).emit("room:votes_hidden");
		});

		socket.on("room:reset", async () => {
			const { roomId } = socket.data as { roomId?: string };
			if (!roomId) return;
			await prisma.roomSession.updateMany({
				where: { roomId, leftAt: null },
				data: { currentVote: null, lastSeenAt: new Date() },
			});
			await prisma.room.update({
				where: { id: roomId },
				data: { votesRevealed: false, lastActivityAt: new Date() },
			});
			nsp.to(roomId).emit("room:reset");
		});

		socket.on("disconnect", async () => {
			const { roomId, identityKey } = socket.data as {
				roomId?: string;
				identityKey?: string;
			};
			if (!roomId || !identityKey) return;
			await prisma.roomSession
				.updateMany({
					where: { roomId, identityKey, leftAt: null },
					data: { leftAt: new Date(), lastSeenAt: new Date() },
				})
				.catch(() => undefined);
			await prisma.roomParticipantHistory
				.create({
					data: {
						roomId,
						identityKey,
						displayName: "user",
						eventType: "leave",
					},
				})
				.catch(() => undefined);
			nsp.to(roomId).emit("user:left", { user_id: identityKey });
		});
	});

	return io;
};
