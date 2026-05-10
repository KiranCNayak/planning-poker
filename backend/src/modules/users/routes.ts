import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { requireAuth } from "../../middleware/auth.js";

const usernameSchema = z.object({
	username: z
		.string()
		.min(3)
		.max(50)
		.regex(/^[a-zA-Z0-9_]+$/),
});

export const usersRouter = Router();

usersRouter.get(
	"/me",
	requireAuth,
	asyncHandler(async (req, res) => {
		const user = await prisma.user.findUnique({
			where: { id: req.auth!.sub },
		});
		if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });
		return res.json({
			id: user.id,
			email: user.email,
			username: user.username,
			isAnonymous: user.isAnonymous,
		});
	}),
);

usersRouter.patch(
	"/me/username",
	requireAuth,
	asyncHandler(async (req, res) => {
		const parsed = usernameSchema.safeParse(req.body);
		if (!parsed.success)
			return res.status(400).json({ error: "BAD_REQUEST" });

		const { username } = parsed.data;
		const userId = req.auth!.sub;

		let taken = false;
		await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
			// Advisory lock prevents concurrent claims of the same username
			await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${username}))`;

			const existing = await tx.usernameReservation.findUnique({
				where: { username },
			});
			if (existing && existing.userId !== userId) {
				taken = true;
				return;
			}

			await tx.usernameReservation.upsert({
				where: { username },
				create: { username, userId },
				update: {},
			});
			await tx.user.update({
				where: { id: userId },
				data: { username },
			});
		});

		if (taken) return res.status(409).json({ error: "USERNAME_TAKEN" });
		return res.status(204).send();
	}),
);
