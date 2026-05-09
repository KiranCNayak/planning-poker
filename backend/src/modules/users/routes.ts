import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";

const usernameSchema = z.object({
	username: z
		.string()
		.min(3)
		.max(50)
		.regex(/^[a-zA-Z0-9_]+$/),
});

export const usersRouter = Router();

usersRouter.get("/me", requireAuth, async (req, res) => {
	const user = await prisma.user.findUnique({ where: { id: req.auth!.sub } });
	if (!user) return res.status(404).json({ error: "USER_NOT_FOUND" });
	return res.json({
		id: user.id,
		email: user.email,
		username: user.username,
		isAnonymous: user.isAnonymous,
	});
});

usersRouter.patch("/me/username", requireAuth, async (req, res) => {
	const parsed = usernameSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "BAD_REQUEST" });

	const existing = await prisma.usernameReservation.findUnique({
		where: { username: parsed.data.username },
	});
	if (existing && existing.userId !== req.auth!.sub)
		return res.status(409).json({ error: "USERNAME_TAKEN" });

	await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
		await tx.usernameReservation.upsert({
			where: { username: parsed.data.username },
			create: { username: parsed.data.username, userId: req.auth!.sub },
			update: {},
		});
		await tx.user.update({
			where: { id: req.auth!.sub },
			data: { username: parsed.data.username },
		});
	});

	return res.status(204).send();
});
