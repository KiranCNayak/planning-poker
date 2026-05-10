import type { Namespace } from "socket.io";
import type { Redis } from "ioredis";
import type { PrismaClient } from "@prisma/client";

interface PendingLeaveValue {
	disconnectedAt: number;
	displayName: string;
}

const GRACE_MS = 60_000;
const SWEEP_INTERVAL_MS = 10_000;

async function* scanKeys(redis: Redis, pattern: string, count = 100) {
	let cursor = "0";
	do {
		const [next, keys] = await redis.scan(
			cursor,
			"MATCH",
			pattern,
			"COUNT",
			count,
		);
		cursor = next;
		yield keys;
	} while (cursor !== "0");
}

async function finalizeLeave(
	key: string,
	redis: Redis,
	prisma: PrismaClient,
	nsp: Namespace,
) {
	const raw = await redis.get(key);
	if (!raw) return; // already reconnected and deleted

	let parsed: PendingLeaveValue;
	try {
		parsed = JSON.parse(raw) as PendingLeaveValue;
	} catch {
		await redis.del(key);
		return;
	}

	if (Date.now() - parsed.disconnectedAt < GRACE_MS) return;

	// Atomically claim the key so parallel sweeper instances don't double-finalize
	const deleted = await redis.del(key);
	if (deleted === 0) return; // another instance beat us to it

	// Parse identityKey and roomId from key pattern: pending_leave:{identityKey}:{roomId}
	const withoutPrefix = key.slice("pending_leave:".length);
	const lastColon = withoutPrefix.lastIndexOf(":");
	if (lastColon === -1) return;
	const identityKey = withoutPrefix.slice(0, lastColon);
	const roomId = withoutPrefix.slice(lastColon + 1);

	await Promise.all([
		redis.srem(`room:${roomId}:members`, identityKey),
		redis.del(`session:${identityKey}:${roomId}`),
	]);

	const result = await prisma.roomSession.updateMany({
		where: { roomId, identityKey, leftAt: null },
		data: { leftAt: new Date(), lastSeenAt: new Date() },
	});

	await prisma.roomParticipantHistory.create({
		data: {
			roomId,
			identityKey,
			displayName: parsed.displayName,
			eventType: "leave",
		},
	});

	// Only broadcast if we actually updated a session row (guards against double-emit)
	if (result.count > 0) {
		nsp.to(roomId).emit("user:left", { user_id: identityKey });
	}
}

export function startPendingLeaveSweeper(
	nsp: Namespace,
	redis: Redis,
	prisma: PrismaClient,
) {
	const tick = async () => {
		try {
			for await (const keys of scanKeys(redis, "pending_leave:*")) {
				for (const key of keys) {
					await finalizeLeave(key, redis, prisma, nsp).catch((err) =>
						console.error("sweeper: error finalizing", key, err),
					);
				}
			}
		} catch (err) {
			console.error("sweeper: scan error", err);
		}
	};

	const interval = setInterval(tick, SWEEP_INTERVAL_MS);
	interval.unref(); // don't block process exit
	return interval;
}
