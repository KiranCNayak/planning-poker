import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { asyncHandler } from "../../lib/asyncHandler.js";
import { env } from "../../config/env.js";
import { loginUser, registerUser } from "./service.js";
import {
	signAccessToken,
	signAnonToken,
	signRefreshToken,
	verifyAnonToken,
	verifyRefreshToken,
} from "./tokens.js";

// Cookies emitted by auth flows. `secure` flips on in production so the
// browser refuses to send them over plaintext HTTP behind the prod gateway.
const cookieDefaults = {
	httpOnly: true,
	sameSite: "lax" as const,
	secure: env.NODE_ENV === "production",
	path: "/",
};

const registerSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
	anonId: z.string().uuid().optional(),
	inviteCode: z.string().optional(),
});
const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
});

export const authRouter = Router();

authRouter.post(
	"/anon/bootstrap",
	asyncHandler(async (req, res) => {
		const existing = req.cookies?.anon_token as string | undefined;
		if (existing) {
			try {
				const payload = verifyAnonToken(existing);
				return res.json({ anonId: payload.anonId });
			} catch {
				// cookie is invalid — issue a new one below
			}
		}
		const anonId = crypto.randomUUID();
		const anonToken = signAnonToken(anonId);
		res.cookie("anon_token", anonToken, cookieDefaults);
		return res.json({ anonId });
	}),
);

authRouter.post(
	"/register",
	asyncHandler(async (req, res) => {
		const parsed = registerSchema.safeParse(req.body);
		if (!parsed.success)
			return res.status(400).json({ error: "BAD_REQUEST" });

		if (env.INVITE_CODE && parsed.data.inviteCode !== env.INVITE_CODE) {
			return res.status(403).json({ error: "INVALID_INVITE_CODE" });
		}

		let user;
		try {
			user = await registerUser(
				parsed.data.email,
				parsed.data.password,
				parsed.data.anonId,
			);
		} catch (err: unknown) {
			if (
				typeof err === "object" &&
				err !== null &&
				"code" in err &&
				(err as { code: string }).code === "P2002"
			) {
				return res.status(409).json({ error: "EMAIL_TAKEN" });
			}
			throw err;
		}

		const access = signAccessToken(user.id);
		const refresh = signRefreshToken(user.id);
		res.cookie("refresh_token", refresh, cookieDefaults);
		return res.json({
			accessToken: access,
			user: { id: user.id, email: user.email, username: user.username },
		});
	}),
);

authRouter.post(
	"/login",
	asyncHandler(async (req, res) => {
		const parsed = loginSchema.safeParse(req.body);
		if (!parsed.success)
			return res.status(400).json({ error: "BAD_REQUEST" });

		const user = await loginUser(parsed.data.email, parsed.data.password);
		if (!user)
			return res.status(401).json({ error: "INVALID_CREDENTIALS" });

		const access = signAccessToken(user.id);
		const refresh = signRefreshToken(user.id);
		res.cookie("refresh_token", refresh, cookieDefaults);
		return res.json({
			accessToken: access,
			user: { id: user.id, email: user.email, username: user.username },
		});
	}),
);

authRouter.post(
	"/refresh",
	asyncHandler(async (req, res) => {
		const token = req.cookies?.refresh_token as string | undefined;
		if (!token) return res.status(401).json({ error: "MISSING_REFRESH" });

		let payload;
		try {
			payload = verifyRefreshToken(token);
		} catch {
			return res.status(401).json({ error: "INVALID_REFRESH" });
		}

		const user = await prisma.user.findUnique({
			where: { id: payload.sub },
		});
		if (!user) return res.status(401).json({ error: "INVALID_REFRESH" });

		const access = signAccessToken(user.id);
		const refresh = signRefreshToken(user.id);
		res.cookie("refresh_token", refresh, cookieDefaults);
		return res.json({ accessToken: access });
	}),
);

authRouter.post("/logout", (_req, res) => {
	res.clearCookie("refresh_token", { path: cookieDefaults.path });
	return res.status(204).send();
});
