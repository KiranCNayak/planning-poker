import crypto from "node:crypto";
import type { Request } from "express";
import { env } from "../config/env.js";

const h = (value: string) =>
	crypto
		.createHmac("sha256", env.FINGERPRINT_SALT)
		.update(value)
		.digest("hex")
		.slice(0, 24);

export const buildIdentityKey = (primaryId: string, fp: string, ip: string) =>
	`id:${primaryId}|fp:${h(fp)}|ip:${h(ip)}`;

export const buildIdentityKeyFromRequest = (req: Request, primaryId: string) =>
	buildIdentityKey(
		primaryId,
		req.header("x-fingerprint") ?? "unknown",
		req.ip ?? "unknown",
	);
