import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

const banSchema = z.object({
	targetIdentityKey: z.string().min(10).optional(),
	targetUserId: z.string().uuid().optional(),
	reason: z.string().max(200).optional(),
});

const liftSchema = z.object({ identityKey: z.string().min(10) });

export const bansRouter = Router({ mergeParams: true });

const ownerRoom = async (shortCode: string, userId: string) => {
	const room = await prisma.room.findUnique({ where: { shortCode } });
	if (!room || !room.isActive) return null;
	if (room.ownerId !== userId) return undefined;
	return room;
};

bansRouter.get("/", requireAuth, async (req, res) => {
	const room = await ownerRoom(req.params.shortCode, req.auth!.sub);
	if (room === undefined) return res.status(403).json({ error: "FORBIDDEN" });
	if (!room) return res.status(404).json({ error: "ROOM_NOT_FOUND" });

	const bans = await prisma.roomBan.findMany({
		where: { roomId: room.id, liftedAt: null },
	});
	return res.json({ bans });
});

bansRouter.post("/", requireAuth, async (req, res) => {
	const room = await ownerRoom(req.params.shortCode, req.auth!.sub);
	if (room === undefined) return res.status(403).json({ error: "FORBIDDEN" });
	if (!room) return res.status(404).json({ error: "ROOM_NOT_FOUND" });

	const parsed = banSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "BAD_REQUEST" });

	let identityKey = parsed.data.targetIdentityKey;
	if (!identityKey && parsed.data.targetUserId) {
		const session = await prisma.roomSession.findFirst({
			where: {
				roomId: room.id,
				userId: parsed.data.targetUserId,
				leftAt: null,
			},
		});
		identityKey = session?.identityKey;
	}

	if (!identityKey) return res.status(400).json({ error: "MISSING_TARGET" });

	const priorCount = await prisma.roomBan.count({
		where: { roomId: room.id, identityKey },
	});
	const tier = priorCount + 1;
	const minutes = tier === 1 ? 10 : tier === 2 ? 60 : null;
	const expiresAt = minutes ? new Date(Date.now() + minutes * 60_000) : null;

	const ban = await prisma.roomBan.create({
		data: {
			roomId: room.id,
			identityKey,
			bannedByUserId: req.auth!.sub,
			reason: parsed.data.reason,
			tier,
			expiresAt,
		},
	});

	return res.status(201).json({ ban });
});

bansRouter.post("/lift", requireAuth, async (req, res) => {
	const room = await ownerRoom(req.params.shortCode, req.auth!.sub);
	if (room === undefined) return res.status(403).json({ error: "FORBIDDEN" });
	if (!room) return res.status(404).json({ error: "ROOM_NOT_FOUND" });

	const parsed = liftSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "BAD_REQUEST" });

	await prisma.roomBan.updateMany({
		where: {
			roomId: room.id,
			identityKey: parsed.data.identityKey,
			liftedAt: null,
		},
		data: { liftedAt: new Date(), liftedByUserId: req.auth!.sub },
	});

	return res.status(204).send();
});
