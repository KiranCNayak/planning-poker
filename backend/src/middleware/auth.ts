import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken, verifyAnonToken } from "../modules/auth/tokens.js";

export const optionalAuth = (
	req: Request,
	_res: Response,
	next: NextFunction,
) => {
	const authHeader = req.header("authorization");
	if (authHeader?.startsWith("Bearer ")) {
		try {
			req.auth = verifyAccessToken(authHeader.slice(7));
		} catch {
			// no-op
		}
	}

	const anon = req.cookies?.anon_token as string | undefined;
	if (!req.auth && anon) {
		try {
			const payload = verifyAnonToken(anon);
			req.anonId = payload.anonId;
		} catch {
			// no-op
		}
	}
	next();
};

export const requireAuth = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	if (!req.auth?.sub || req.auth.kind !== "access") {
		return res.status(401).json({ error: "UNAUTHORIZED" });
	}
	next();
};
