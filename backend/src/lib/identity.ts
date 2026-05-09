import crypto from "node:crypto";
import type { Request } from "express";
import { env } from "../config/env.js";

const h = (value: string) =>
	crypto
		.createHmac("sha256", env.FINGERPRINT_SALT)
		.update(value)
		.digest("hex")
		.slice(0, 24);

export const buildIdentityKey = (req: Request, primaryId: string) => {
	const fp = String(req.header("x-fingerprint") ?? "unknown");
	const ip = req.ip ?? "unknown";
	return `id:${primaryId}|fp:${h(fp)}|ip:${h(ip)}`;
};
