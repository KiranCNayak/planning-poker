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

/**
 * Resolves the real client IP for a Socket.IO connection.
 *
 * Mirrors Express's `trust proxy = N` semantics: the address chain is
 * `[...X-Forwarded-For entries, socket.handshake.address]`, and we skip
 * `N` trusted hops from the right end. With TRUST_PROXY=0 the socket
 * address is returned verbatim; with TRUST_PROXY=1 behind one gateway
 * that emits `X-Forwarded-For: <client>`, the client IP is returned.
 *
 * The gateway MUST overwrite (not append) X-Forwarded-For on ingress so
 * untrusted clients cannot spoof their apparent IP.
 */
export const resolveClientIp = (
	socketAddress: string,
	xffHeader: string | string[] | undefined,
	trustProxy: number,
): string => {
	const raw = Array.isArray(xffHeader)
		? xffHeader.join(",")
		: (xffHeader ?? "");
	const xffList = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const chain = [...xffList, socketAddress];
	const skip = Math.max(0, Math.min(trustProxy, chain.length - 1));
	return chain[chain.length - 1 - skip] ?? socketAddress;
};
