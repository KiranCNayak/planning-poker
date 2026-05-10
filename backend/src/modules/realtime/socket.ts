import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import { redis } from "../../lib/redis.js";
import { corsOrigins } from "../../config/env.js";
import { verifyAccessToken, verifyAnonToken } from "../auth/tokens.js";
import { buildIdentityKey } from "../../lib/identity.js";

// Keep in sync with frontend/src/lib/deck.ts
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

interface SocketData {
	identityKey: string;
	userId?: string;
	roomId?: string;
	displayName?: string;
}

const parseCookies = (header: string): Record<string, string> =>
	Object.fromEntries(
		header
			.split(";")
			.map((c) => c.trim().split("="))
			.filter((parts) => parts.length >= 2)
			.map(([k, ...rest]) => [
				k.trim(),
				decodeURIComponent(rest.join("=").trim()),
			]),
	);

export const initSocket = (httpServer: HttpServer) => {
	const io = new Server(httpServer, {
		cors: { origin: corsOrigins, credentials: true },
	});

	const nsp = io.of("/room");

	// Build identity server-side from token + fingerprint + IP
	nsp.use(async (socket, next) => {
		try {
			const token = socket.handshake.auth.token as string | undefined;
			const fp =
				(socket.handshake.auth.fingerprint as string | undefined) ??
				"unknown";
			const ip = socket.handshake.address;

			let primaryId: string | undefined;

			if (token) {
				try {
					const payload = verifyAccessToken(token);
					if (payload.kind === "access") {
						(socket.data as SocketData).userId = payload.sub;
						primaryId = payload.sub;
					}
				} catch {
					// invalid access token — fall through to anon
				}
			}

			if (!primaryId) {
				const cookies = parseCookies(
					socket.handshake.headers.cookie ?? "",
				);
				const anonToken = cookies["anon_token"];
				if (anonToken) {
					try {
						const payload = verifyAnonToken(anonToken);
						primaryId = payload.anonId;
					} catch {
						// invalid anon token
					}
				}
			}

			// Last resort: temporary anonymous ID (no cookie yet)
			if (!primaryId) primaryId = `tmp_${crypto.randomUUID()}`;

			(socket.data as SocketData).identityKey = buildIdentityKey(
				primaryId,
				fp,
				ip,
			);
			next();
		} catch (err) {
			next(err as Error);
		}
	});

	nsp.on("connection", (socket) => {
		const data = () => socket.data as SocketData;

		socket.on("room:join", async ({ shortCode, displayName }) => {
			try {
				const identityKey = data().identityKey;

				const room = await prisma.room.findUnique({
					where: { shortCode },
				});
				if (!room || !room.isActive) {
					socket.emit("room:expired");
					return;
				}

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
				if (ban) {
					socket.emit("room:banned", {
						reason: ban.reason,
						expires_at: ban.expiresAt,
					});
					return;
				}

				// Reconnect detection must precede capacity check
				const sessionKey = `session:${identityKey}:${room.id}`;
				const [redisSession, existing] = await Promise.all([
					redis.get(sessionKey),
					prisma.roomSession.findFirst({
						where: { roomId: room.id, identityKey },
					}),
				]);
				const isReconnect =
					!!redisSession || (!!existing && !existing.leftAt);

				if (!isReconnect) {
					const memberCount = await redis.scard(
						`room:${room.id}:members`,
					);
					if (memberCount >= room.capacity) {
						socket.emit("room:capacity_exceeded");
						return;
					}
				}

				const safeDisplayName =
					(displayName as string | undefined)?.slice(0, 50) ?? "user";

				if (existing) {
					await prisma.roomSession.update({
						where: { id: existing.id },
						data: {
							leftAt: null,
							lastSeenAt: new Date(),
							displayName: safeDisplayName,
						},
					});
				} else {
					await prisma.roomSession.create({
						data: {
							roomId: room.id,
							identityKey,
							displayName: safeDisplayName,
							joinedAt: new Date(),
							lastSeenAt: new Date(),
						},
					});
				}

				await prisma.roomParticipantHistory.create({
					data: {
						roomId: room.id,
						identityKey,
						displayName: safeDisplayName,
						eventType: "join",
					},
				});

				// Redis: add to members set and start heartbeat
				await Promise.all([
					redis.sadd(`room:${room.id}:members`, identityKey),
					redis.set(sessionKey, "1", "EX", 60),
				]);

				// Restore vote from Redis if reconnecting
				const restoredVote = isReconnect
					? await redis.hget(`room:${room.id}:votes`, identityKey)
					: null;

				socket.join(room.id);
				(socket.data as SocketData).roomId = room.id;
				(socket.data as SocketData).displayName = safeDisplayName;

				nsp.to(room.id).emit("user:joined", {
					user_id: identityKey,
					display_name: safeDisplayName,
					is_authenticated: !!data().userId,
				});
				socket.emit("room:state_sync", {
					roomId: room.id,
					identityKey,
					is_reconnect: isReconnect,
					restored_vote: restoredVote ?? null,
				});
			} catch (err) {
				console.error("room:join error", err);
			}
		});

		socket.on("room:vote", async ({ value }) => {
			try {
				const { roomId, identityKey } = data();
				if (!roomId) return;
				if (!VOTE_VALUES.has(String(value))) return;

				await Promise.all([
					prisma.roomSession.updateMany({
						where: { roomId, identityKey, leftAt: null },
						data: {
							currentVote: String(value),
							lastSeenAt: new Date(),
						},
					}),
					redis.hset(
						`room:${roomId}:votes`,
						identityKey,
						String(value),
					),
					redis.expire(`session:${identityKey}:${roomId}`, 60),
				]);

				nsp.to(roomId).emit("user:voted", { user_id: identityKey });
			} catch (err) {
				console.error("room:vote error", err);
			}
		});

		socket.on("room:reveal", async () => {
			try {
				const { roomId } = data();
				if (!roomId) return;

				// Redis first, fall back to DB
				const votes: Record<string, string> =
					(await redis.hgetall(`room:${roomId}:votes`)) ?? {};
				if (Object.keys(votes).length === 0) {
					const sessions = await prisma.roomSession.findMany({
						where: {
							roomId,
							leftAt: null,
							currentVote: { not: null },
						},
					});
					for (const s of sessions) {
						if (s.currentVote) votes[s.identityKey] = s.currentVote;
					}
				}

				await prisma.room.update({
					where: { id: roomId },
					data: { votesRevealed: true, lastActivityAt: new Date() },
				});
				nsp.to(roomId).emit("room:votes_revealed", { votes });
			} catch (err) {
				console.error("room:reveal error", err);
			}
		});

		socket.on("room:hide", async () => {
			try {
				const { roomId } = data();
				if (!roomId) return;
				await prisma.room.update({
					where: { id: roomId },
					data: { votesRevealed: false, lastActivityAt: new Date() },
				});
				nsp.to(roomId).emit("room:votes_hidden");
			} catch (err) {
				console.error("room:hide error", err);
			}
		});

		socket.on("room:reset", async () => {
			try {
				const { roomId } = data();
				if (!roomId) return;

				await Promise.all([
					prisma.roomSession.updateMany({
						where: { roomId, leftAt: null },
						data: { currentVote: null, lastSeenAt: new Date() },
					}),
					prisma.room.update({
						where: { id: roomId },
						data: {
							votesRevealed: false,
							lastActivityAt: new Date(),
						},
					}),
					redis.del(`room:${roomId}:votes`),
				]);

				nsp.to(roomId).emit("room:reset");
			} catch (err) {
				console.error("room:reset error", err);
			}
		});

		socket.on("room:kick", async ({ targetIdentityKey }) => {
			try {
				const { roomId, userId } = data();
				if (!roomId || !userId) return;

				const room = await prisma.room.findUnique({
					where: { id: roomId },
				});
				if (!room || room.ownerId !== userId) return;

				const sockets = await nsp.in(roomId).fetchSockets();
				const target = sockets.find(
					(s) =>
						(s.data as SocketData).identityKey ===
						targetIdentityKey,
				);
				if (target) {
					target.emit("room:kicked");
					target.disconnect();
				}

				await Promise.all([
					prisma.roomSession.updateMany({
						where: {
							roomId,
							identityKey: targetIdentityKey,
							leftAt: null,
						},
						data: { leftAt: new Date() },
					}),
					redis.srem(`room:${roomId}:members`, targetIdentityKey),
				]);

				nsp.to(roomId).emit("user:left", {
					user_id: targetIdentityKey,
				});
			} catch (err) {
				console.error("room:kick error", err);
			}
		});

		socket.on("room:ban", async ({ targetIdentityKey, reason }) => {
			try {
				const { roomId, userId } = data();
				if (!roomId || !userId) return;

				const room = await prisma.room.findUnique({
					where: { id: roomId },
				});
				if (!room || room.ownerId !== userId) return;

				const priorCount = await prisma.roomBan.count({
					where: { roomId, identityKey: targetIdentityKey },
				});
				const tier = priorCount + 1;
				const minutes = tier === 1 ? 10 : tier === 2 ? 60 : null;
				const expiresAt = minutes
					? new Date(Date.now() + minutes * 60_000)
					: null;

				await prisma.roomBan.create({
					data: {
						roomId,
						identityKey: targetIdentityKey,
						bannedByUserId: userId,
						reason: (reason as string | undefined) ?? null,
						tier,
						expiresAt,
					},
				});

				const sockets = await nsp.in(roomId).fetchSockets();
				const target = sockets.find(
					(s) =>
						(s.data as SocketData).identityKey ===
						targetIdentityKey,
				);
				if (target) {
					target.emit("room:banned", {
						reason: (reason as string | undefined) ?? null,
						expires_at: expiresAt,
					});
					target.disconnect();
				}

				await Promise.all([
					prisma.roomSession.updateMany({
						where: {
							roomId,
							identityKey: targetIdentityKey,
							leftAt: null,
						},
						data: { leftAt: new Date() },
					}),
					redis.srem(`room:${roomId}:members`, targetIdentityKey),
				]);

				nsp.to(roomId).emit("user:left", {
					user_id: targetIdentityKey,
				});
			} catch (err) {
				console.error("room:ban error", err);
			}
		});

		socket.on("disconnect", async () => {
			try {
				const { roomId, identityKey, displayName } = data();
				if (!roomId) return;

				await Promise.all([
					prisma.roomSession
						.updateMany({
							where: { roomId, identityKey, leftAt: null },
							data: {
								leftAt: new Date(),
								lastSeenAt: new Date(),
							},
						})
						.catch(() => undefined),
					prisma.roomParticipantHistory
						.create({
							data: {
								roomId,
								identityKey,
								displayName: displayName ?? "user",
								eventType: "leave",
							},
						})
						.catch(() => undefined),
					redis.srem(`room:${roomId}:members`, identityKey),
					redis.del(`session:${identityKey}:${roomId}`),
				]);

				nsp.to(roomId).emit("user:left", { user_id: identityKey });
			} catch (err) {
				console.error("disconnect error", err);
			}
		});
	});

	return io;
};
