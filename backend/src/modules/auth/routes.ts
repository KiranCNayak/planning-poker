import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { loginUser, registerUser } from "./service.js";
import {
	signAccessToken,
	signAnonToken,
	signRefreshToken,
	verifyRefreshToken,
} from "./tokens.js";

const registerSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
	anonId: z.string().uuid().optional(),
});
const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
});

export const authRouter = Router();

authRouter.post("/anon/bootstrap", async (req, res) => {
	const existing = req.cookies?.anon_token as string | undefined;
	if (existing) {
		return res.json({ ok: true });
	}
	const anonId = crypto.randomUUID();
	const anonToken = signAnonToken(anonId);
	res.cookie("anon_token", anonToken, {
		httpOnly: true,
		sameSite: "lax",
		secure: false,
		path: "/",
	});
	return res.json({ anonId });
});

authRouter.post("/register", async (req, res) => {
	const parsed = registerSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "BAD_REQUEST" });

	const user = await registerUser(
		parsed.data.email,
		parsed.data.password,
		parsed.data.anonId,
	);
	const access = signAccessToken(user.id);
	const refresh = signRefreshToken(user.id);
	res.cookie("refresh_token", refresh, {
		httpOnly: true,
		sameSite: "lax",
		secure: false,
		path: "/",
	});
	return res.json({
		accessToken: access,
		user: { id: user.id, email: user.email, username: user.username },
	});
});

authRouter.post("/login", async (req, res) => {
	const parsed = loginSchema.safeParse(req.body);
	if (!parsed.success) return res.status(400).json({ error: "BAD_REQUEST" });

	const user = await loginUser(parsed.data.email, parsed.data.password);
	if (!user) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

	const access = signAccessToken(user.id);
	const refresh = signRefreshToken(user.id);
	res.cookie("refresh_token", refresh, {
		httpOnly: true,
		sameSite: "lax",
		secure: false,
		path: "/",
	});
	return res.json({
		accessToken: access,
		user: { id: user.id, email: user.email, username: user.username },
	});
});

authRouter.post("/refresh", async (req, res) => {
	const token = req.cookies?.refresh_token as string | undefined;
	if (!token) return res.status(401).json({ error: "MISSING_REFRESH" });
	try {
		const payload = verifyRefreshToken(token);
		const user = await prisma.user.findUnique({
			where: { id: payload.sub },
		});
		if (!user) return res.status(401).json({ error: "INVALID_REFRESH" });

		const access = signAccessToken(user.id);
		const refresh = signRefreshToken(user.id);
		res.cookie("refresh_token", refresh, {
			httpOnly: true,
			sameSite: "lax",
			secure: false,
			path: "/",
		});
		return res.json({ accessToken: access });
	} catch {
		return res.status(401).json({ error: "INVALID_REFRESH" });
	}
});

authRouter.post("/logout", (_req, res) => {
	res.clearCookie("refresh_token", { path: "/" });
	return res.status(204).send();
});
