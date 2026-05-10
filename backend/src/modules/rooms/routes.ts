import { Router } from "express";
import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";
import { buildIdentityKeyFromRequest } from "../../lib/identity.js";
import { writeAuditEvent } from "../audit/service.js";
import { env } from "../../config/env.js";

const createRoomSchema = z.object({
	name: z.string().min(1).max(40).optional(),
});

export const roomsRouter = Router();

roomsRouter.post(
	"/",
	requireAuth,
	asyncHandler(async (req, res) => {
		const parsed = createRoomSchema.safeParse(req.body);
		if (!parsed.success)
			return res.status(400).json({ error: "BAD_REQUEST" });

		const ownerId = req.auth!.sub;
		const identityKey = buildIdentityKeyFromRequest(req, ownerId);

		const room = await prisma.$transaction(
			async (tx: Prisma.TransactionClient) => {
				const created = await tx.room.create({
					data: {
						ownerId,
						shortCode: crypto.randomUUID(),
						name: parsed.data.name,
						isActive: true,
						capacity: env.ROOM_CAPACITY_LIMIT,
					},
				});

				await writeAuditEvent(tx, {
					roomId: created.id,
					userId: ownerId,
					eventType: "room_created",
					payload: {
						shortCode: created.shortCode,
						ownerId,
						identityKey,
					},
				});

				return created;
			},
		);

		return res.status(201).json({
			roomId: room.id,
			shortCode: room.shortCode,
			url: `/room/${room.shortCode}`,
		});
	}),
);

roomsRouter.get(
	"/:shortCode",
	asyncHandler(async (req, res) => {
		const room = await prisma.room.findUnique({
			where: { shortCode: req.params.shortCode },
		});
		if (!room || !room.isActive)
			return res.status(404).json({ error: "ROOM_NOT_FOUND" });
		return res.json({
			roomId: room.id,
			shortCode: room.shortCode,
			name: room.name,
			votesRevealed: room.votesRevealed,
			capacity: room.capacity,
		});
	}),
);

roomsRouter.delete(
	"/:shortCode",
	requireAuth,
	asyncHandler(async (req, res) => {
		const room = await prisma.room.findUnique({
			where: { shortCode: req.params.shortCode },
		});
		if (!room) return res.status(404).json({ error: "ROOM_NOT_FOUND" });
		if (room.ownerId !== req.auth?.sub)
			return res.status(403).json({ error: "FORBIDDEN" });

		await prisma.room.update({
			where: { id: room.id },
			data: { isActive: false },
		});
		return res.status(204).send();
	}),
);
