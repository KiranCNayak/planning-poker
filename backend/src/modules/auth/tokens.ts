import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

export type JwtPayload = {
	sub: string;
	kind: "access" | "refresh" | "anon";
	anonId?: string;
};

export const signAccessToken = (sub: string) =>
	jwt.sign({ sub, kind: "access" }, env.JWT_ACCESS_SECRET, {
		expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
	});

export const signRefreshToken = (sub: string) =>
	jwt.sign({ sub, kind: "refresh" }, env.JWT_REFRESH_SECRET, {
		expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
	});

export const signAnonToken = (anonId: string) =>
	jwt.sign({ sub: anonId, kind: "anon", anonId }, env.JWT_ACCESS_SECRET, {
		expiresIn: "90d",
	});

export const verifyAccessToken = (token: string) =>
	jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
export const verifyRefreshToken = (token: string) =>
	jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
export const verifyAnonToken = (token: string) =>
	jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
